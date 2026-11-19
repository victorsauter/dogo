using Dogo.Api.Features.Admin;
using Dogo.Api.Features.Notifications;
using Dogo.Api.Infrastructure.Auth;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Features.Reports;

/// <summary>
/// Tells the administration that a report was created (spec §4.7). Called once the report is
/// saved. Wrapped in a recorder by the tests.
/// </summary>
public interface IReportNotifier
{
    Task ReportCreatedAsync(Report report, CancellationToken cancellationToken);
}

/// <summary>
/// The V1 implementation (ADR 0036): a push notification to every administrator (active
/// account listed in <c>Admin:Emails</c>, ADR 0031) except the reporter, through the
/// notification queue, and a log line. The notification says only that a report arrived and
/// its category; the log only its id and type. Neither carries the facts nor who is involved.
/// No e-mail is sent: no provider is chosen (spec §7), <c>Admin:ReportEmail</c> is unused.
/// </summary>
public sealed partial class AdminReportNotifier(
    DogoDbContext db,
    NotificationQueue notifications,
    IOptions<AdminOptions> options,
    ILogger<AdminReportNotifier> logger) : IReportNotifier
{
    public async Task ReportCreatedAsync(Report report, CancellationToken cancellationToken)
    {
        var adminIds = await db.AdminIdsAsync(options.Value, cancellationToken);
        var recipients = adminIds.Where(id => id != report.ReporterId).ToList();
        LogReportCreated(report.Id, report.Type, !string.IsNullOrWhiteSpace(options.Value.ReportEmail), recipients.Count);

        // The reporter, if an administrator, is the actor: never notified of their own report.
        notifications.Enqueue(new NotificationRequest(
            NotificationType.ReportCreated, NotificationSubject.ForReport(report), report.ReporterId, recipients));
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Report {ReportId} ({Type}) created; push sent to {AdminCount} administrators; e-mail not sent (no provider, admin address configured: {AddressConfigured})")]
    private partial void LogReportCreated(Guid reportId, ReportType type, bool addressConfigured, int adminCount);
}
