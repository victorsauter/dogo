using Dogo.Api.Features.Notifications;
using Dogo.Api.Features.Organizations;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Features.Walks;

/// <summary>
/// Creates the next walk of each active weekly series whose latest walk has started
/// (spec §4.5). Called periodically by <see cref="Infrastructure.Jobs.BackgroundJobsService"/>;
/// tests call it directly with a controlled clock.
/// </summary>
/// <remarks>
/// There is never more than one upcoming walk per series, even with concurrent runs: the
/// series row is locked (<c>SELECT … FOR UPDATE</c>) and the condition checked again under the
/// lock before inserting.
/// </remarks>
public sealed partial class WalkSeriesJob(
    DogoDbContext db,
    TimeProvider timeProvider,
    NotificationQueue notifications,
    ILogger<WalkSeriesJob> logger)
{
    /// <summary>Creates the due walks; returns how many were created.</summary>
    public async Task<int> RunAsync(CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var dueSeriesIds = await db.WalkSeries.AsNoTracking()
            .Where(s => s.Active
                && db.Walks.Any(w => w.SeriesId == s.Id)
                && !db.Walks.Any(w => w.SeriesId == s.Id && w.StartsAt > now))
            .Select(s => s.Id)
            .ToListAsync(cancellationToken);

        var created = 0;
        foreach (var seriesId in dueSeriesIds)
        {
            try
            {
                if (await TryCreateNextAsync(seriesId, now, cancellationToken))
                {
                    created++;
                }
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                // One faulty series must not block the others.
                LogSeriesFailed(e, seriesId);
            }
            finally
            {
                db.ChangeTracker.Clear();
            }
        }

        return created;
    }

    private async Task<bool> TryCreateNextAsync(Guid seriesId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var series = (await db.WalkSeries.FromSql($"SELECT * FROM walk_series WHERE id = {seriesId} FOR UPDATE").ToListAsync(cancellationToken))
            .SingleOrDefault();
        if (series is not { Active: true })
        {
            return false;
        }

        // Checked again under the lock: another run may have created the next walk meanwhile.
        // A cancelled latest walk still leads to the next one (spec §4.5).
        var latest = await db.Walks.AsNoTracking()
            .Where(w => w.SeriesId == seriesId)
            .OrderByDescending(w => w.StartsAt).ThenByDescending(w => w.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (latest is null || latest.StartsAt > now)
        {
            return false;
        }

        // Spec §4.6: only an approved organisation carries walks, created by its owner or educators.
        // A series whose organisation was closed or rejected, or whose organizer left it or is no
        // longer an educator, stops here; the walks already created stay as they are.
        if (latest.OrganizationId is { } organizationId && !await OrganizerMayCarryAsync(organizationId, latest.OrganizerId, cancellationToken))
        {
            series.Active = false;
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            LogStopped(seriesId, organizationId);
            return false;
        }

        var zone = TimeZoneInfo.FindSystemTimeZoneById(series.TimeZone);

        // A professional walk stays professional: the organisation is copied too.
        var next = new Walk
        {
            OrganizerId = latest.OrganizerId,
            OrganizationId = latest.OrganizationId,
            SeriesId = seriesId,
            Title = latest.Title,
            Description = latest.Description,
            StartsAt = WeeklyRecurrence.NextStart(latest.StartsAt, zone, now),
            DurationMinutes = latest.DurationMinutes,
            Location = Walk.CreatePoint(latest.Location.Y, latest.Location.X),
            LocationLabel = latest.LocationLabel,
            MaxDogs = latest.MaxDogs,
            AllowedSizes = [.. latest.AllowedSizes],
            LeashRule = latest.LeashRule,
            Rules = latest.Rules,
            Access = latest.Access,
        };
        db.Walks.Add(next);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        LogCreated(next.Id, seriesId, next.StartsAt);

        // Registrations are not carried over; the previous walk's participants are told (spec §4.5).
        var participants = await db.Registrations.AsNoTracking()
            .Where(r => r.WalkId == latest.Id && r.Status == RegistrationStatus.Accepted)
            .Select(r => r.UserId)
            .ToListAsync(cancellationToken);
        notifications.Enqueue(new NotificationRequest(NotificationType.SeriesWalkCreated, NotificationSubject.ForWalk(next), null, participants));
        return true;
    }

    /// <summary>The organisation is approved and the organizer is still its owner or an accepted educator.</summary>
    private Task<bool> OrganizerMayCarryAsync(Guid organizationId, Guid? organizerId, CancellationToken cancellationToken) =>
        db.Memberships.AnyAsync(
            m => m.OrganizationId == organizationId
                && m.UserId == organizerId
                && m.Status == MembershipStatus.Accepted
                && (m.Role == MembershipRole.Owner || m.Role == MembershipRole.Educator)
                && m.Organization.Status == OrganizationStatus.Approved,
            cancellationToken);

    [LoggerMessage(Level = LogLevel.Information, Message = "Stopped series {SeriesId}: organisation {OrganizationId} no longer approved, or its organizer no longer owner or educator")]
    private partial void LogStopped(Guid seriesId, Guid organizationId);

    [LoggerMessage(Level = LogLevel.Information, Message = "Created walk {WalkId} of series {SeriesId}, starting at {StartsAt}")]
    private partial void LogCreated(Guid walkId, Guid seriesId, DateTimeOffset startsAt);

    [LoggerMessage(Level = LogLevel.Error, Message = "Creating the next walk of series {SeriesId} failed")]
    private partial void LogSeriesFailed(Exception exception, Guid seriesId);
}
