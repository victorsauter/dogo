using Dogo.Api.Infrastructure.Auth;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Features.Reports;

/// <summary>
/// Tells the administration that a report was created (spec §4.7), at the address
/// <c>Admin:ReportEmail</c>. Faked in tests.
/// </summary>
public interface IReportNotifier
{
    Task ReportCreatedAsync(Report report, CancellationToken cancellationToken);
}

/// <summary>
/// The V1 implementation: no e-mail provider is chosen (spec §7), so it only logs that a report
/// exists. Only the id and type are logged, never the facts nor who is involved.
/// </summary>
public sealed partial class LoggingReportNotifier(IOptions<AdminOptions> options, ILogger<LoggingReportNotifier> logger) : IReportNotifier
{
    public Task ReportCreatedAsync(Report report, CancellationToken cancellationToken)
    {
        LogReportCreated(report.Id, report.Type, !string.IsNullOrWhiteSpace(options.Value.ReportEmail));
        return Task.CompletedTask;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Report {ReportId} ({Type}) created; e-mail not sent (no provider, admin address configured: {AddressConfigured})")]
    private partial void LogReportCreated(Guid reportId, ReportType type, bool addressConfigured);
}
