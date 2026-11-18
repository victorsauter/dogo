using Dogo.Api.Features.Notifications;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Features.Walks;

/// <summary>
/// Sends the reminder 2 hours before a walk to its organizer and accepted participants
/// (spec §4.4). Called periodically by <see cref="Infrastructure.Jobs.BackgroundJobsService"/>;
/// tests call it directly with a controlled clock.
/// </summary>
/// <remarks>
/// Each reminder is claimed in the database before being sent: one <c>UPDATE … WHERE
/// reminder_sent_at IS NULL … RETURNING</c> marks the due walks and returns them. Concurrent
/// runs (several instances) cannot both claim a walk, and a restart does not send it again.
/// A crash between the claim and the sending loses that reminder: at most once (ADR 0019).
/// </remarks>
public sealed partial class WalkReminderJob(
    DogoDbContext db,
    TimeProvider timeProvider,
    NotificationQueue notifications,
    ILogger<WalkReminderJob> logger)
{
    /// <summary>How long before the start the reminder is sent (spec §7).</summary>
    public static readonly TimeSpan Lead = TimeSpan.FromHours(2);

    /// <summary>Claims and sends the due reminders; returns how many walks were reminded.</summary>
    public async Task<int> RunAsync(CancellationToken cancellationToken)
    {
        var now = WalkEndpoints.TruncateToMicroseconds(timeProvider.GetUtcNow());
        var dueUntil = now + Lead;
        var scheduled = nameof(WalkStatus.Scheduled);

        // Cancelled walks and walks already started never get a reminder.
        var walkIds = await db.Database.SqlQuery<Guid>(
                $"""
                UPDATE walks SET reminder_sent_at = {now}
                WHERE reminder_sent_at IS NULL AND status = {scheduled} AND starts_at > {now} AND starts_at <= {dueUntil}
                RETURNING id AS "Value"
                """)
            .ToListAsync(cancellationToken);
        if (walkIds.Count == 0)
        {
            return 0;
        }

        var walks = await db.Walks.AsNoTracking().Where(w => walkIds.Contains(w.Id)).ToListAsync(cancellationToken);
        var participants = (await db.Registrations.AsNoTracking()
                .Where(r => walkIds.Contains(r.WalkId) && r.Status == RegistrationStatus.Accepted)
                .Select(r => new { r.WalkId, r.UserId })
                .ToListAsync(cancellationToken))
            .ToLookup(r => r.WalkId, r => r.UserId);

        foreach (var walk in walks)
        {
            List<Guid> recipients = [walk.OrganizerId, .. participants[walk.Id]];
            notifications.Enqueue(new NotificationRequest(NotificationType.WalkReminder, NotificationSubject.ForWalk(walk), null, recipients));
        }

        LogReminded(walks.Count);
        return walks.Count;
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Reminders claimed for {Count} walks")]
    private partial void LogReminded(int count);
}
