using Dogo.Api.Features.Notifications;
using Dogo.Api.Features.Walks;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Features.Users;

/// <summary>
/// Suspends an account (spec §4.7, ADR 0036): « geler, annuler, laisser partir ». In one
/// transaction the account is frozen (writes refused, sessions revoked), its weekly series
/// stopped, its upcoming walks cancelled with their registrants told, its push devices removed,
/// and its upcoming registrations to other people's walks cancelled. The account may still
/// delete itself. Lifting the suspension restores none of it.
/// </summary>
public sealed partial class AccountSuspension(
    DogoDbContext db,
    NotificationQueue notifications,
    TimeProvider timeProvider,
    ILogger<AccountSuspension> logger)
{
    /// <summary>Suspends the account; returns null when it does not exist. Idempotent.</summary>
    public async Task<User?> SuspendAsync(Guid userId, CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

        // The user row lock serialises the suspension with a deletion of the same account.
        var user = (await db.Users.FromSql($"SELECT * FROM users WHERE id = {userId} FOR UPDATE").ToListAsync(cancellationToken))
            .SingleOrDefault();
        if (user is null)
        {
            return null;
        }

        // Frozen: writes are refused at once (the status is read on every request); revoking the
        // refresh tokens ends the sessions when the current access token expires.
        user.Status = UserStatus.Suspended;
        await db.SaveChangesAsync(cancellationToken);
        await db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), cancellationToken);

        // Their weekly series stop: no new walk is created in their name. The series job locks
        // the series row and reads Active again under the lock, so it cannot race this update.
        var stoppedSeries = await db.WalkSeries.Where(s => s.OrganizerId == userId && s.Active)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.Active, false), cancellationToken);

        // Their upcoming walks are cancelled, as if they had cancelled them.
        var cancelledWalks = await db.CancelUpcomingWalksAsync(userId, now, cancellationToken);

        // No notification reaches a suspended account.
        await db.Devices.Where(d => d.UserId == userId).ExecuteDeleteAsync(cancellationToken);

        var cancelledRegistrations = await CancelUpcomingRegistrationsAsync(userId, now, cancellationToken);

        await transaction.CommitAsync(cancellationToken);
        LogSuspended(userId, stoppedSeries, cancelledWalks.Count, cancelledRegistrations);

        foreach (var notification in cancelledWalks)
        {
            notifications.Enqueue(notification);
        }

        return user;
    }

    /// <summary>
    /// Lifts the suspension; returns null when the account does not exist. Restores nothing:
    /// series stay stopped, walks cancelled, devices removed, sessions revoked. The person signs
    /// in again, and the app registers its device again.
    /// </summary>
    public async Task<User?> UnsuspendAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Id == userId, cancellationToken);
        if (user is null)
        {
            return null;
        }

        user.Status = UserStatus.Active;
        await db.SaveChangesAsync(cancellationToken);
        return user;
    }

    /// <summary>
    /// Extension of the owner's decision (ADR 0036, removable on its own): the account's
    /// pending and accepted registrations to walks that have not started are cancelled, which
    /// frees their places, as if the person had cancelled them (the organizer is not notified).
    /// </summary>
    private async Task<int> CancelUpcomingRegistrationsAsync(Guid userId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var walkIds = await db.Registrations
            .Where(r => r.UserId == userId
                && (r.Status == RegistrationStatus.Pending || r.Status == RegistrationStatus.Accepted)
                && r.Walk.Status == WalkStatus.Scheduled
                && r.Walk.StartsAt > now)
            .Select(r => r.WalkId)
            .Distinct()
            .ToArrayAsync(cancellationToken);
        if (walkIds.Length == 0)
        {
            return 0;
        }

        // The walk row locks serialise this with registrations and acceptances in progress
        // (ADR 0015); taken in id order so that two such operations cannot deadlock.
        await db.Database.SqlQuery<Guid>(
                $"""SELECT id AS "Value" FROM walks WHERE id = ANY({walkIds}) ORDER BY id FOR UPDATE""")
            .ToListAsync(cancellationToken);
        return await db.Registrations
            .Where(r => r.UserId == userId
                && walkIds.Contains(r.WalkId)
                && (r.Status == RegistrationStatus.Pending || r.Status == RegistrationStatus.Accepted))
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, RegistrationStatus.Cancelled), cancellationToken);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Account {UserId} suspended: {SeriesCount} weekly series stopped, {WalkCount} upcoming walks cancelled, {RegistrationCount} upcoming registrations cancelled")]
    private partial void LogSuspended(Guid userId, int seriesCount, int walkCount, int registrationCount);
}
