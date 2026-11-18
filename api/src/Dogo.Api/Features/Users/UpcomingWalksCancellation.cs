using Dogo.Api.Features.Notifications;
using Dogo.Api.Features.Walks;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Features.Users;

/// <summary>
/// Cancels the upcoming walks of an organizer who leaves: account deletion (spec §4.8, ADR 0023)
/// or suspension (ADR 0036). Same effect as the organizer cancelling each walk: the walk becomes
/// <c>Cancelled</c>, its registrations stay as they are, and its accepted and pending
/// registrants get <c>walk_cancelled</c>.
/// </summary>
internal static class UpcomingWalksCancellation
{
    /// <summary>
    /// Cancels the organizer's <c>Scheduled</c> walks that have not started, inside the caller's
    /// transaction. Returns one notification per cancelled walk, to enqueue after the commit.
    /// </summary>
    public static async Task<List<NotificationRequest>> CancelUpcomingWalksAsync(
        this DogoDbContext db, Guid organizerId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        // One UPDATE that locks the walk rows like LockWalkAsync (ADR 0015): a registration in
        // progress finishes first, a later one sees the walk cancelled.
        var cancelledWalkIds = await db.Database.SqlQuery<Guid>(
                $"""
                UPDATE walks SET status = {nameof(WalkStatus.Cancelled)}
                WHERE organizer_id = {organizerId} AND status = {nameof(WalkStatus.Scheduled)} AND starts_at > {now}
                RETURNING id AS "Value"
                """)
            .ToListAsync(cancellationToken);
        if (cancelledWalkIds.Count == 0)
        {
            return [];
        }

        var cancelledWalks = await db.Walks.AsNoTracking().Where(w => cancelledWalkIds.Contains(w.Id)).ToListAsync(cancellationToken);
        var registrants = (await db.Registrations.AsNoTracking()
                .Where(r => cancelledWalkIds.Contains(r.WalkId)
                    && r.UserId != organizerId
                    && (r.Status == RegistrationStatus.Accepted || r.Status == RegistrationStatus.Pending))
                .Select(r => new { r.WalkId, r.UserId })
                .Distinct()
                .ToListAsync(cancellationToken))
            .ToLookup(r => r.WalkId, r => r.UserId);

        return cancelledWalks
            .Select(walk => new NotificationRequest(
                NotificationType.WalkCancelled, NotificationSubject.ForWalk(walk), null, registrants[walk.Id].ToList()))
            .ToList();
    }
}
