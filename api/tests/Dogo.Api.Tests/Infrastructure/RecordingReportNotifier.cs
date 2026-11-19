using System.Collections.Concurrent;
using Dogo.Api.Features.Reports;

namespace Dogo.Api.Tests.Infrastructure;

/// <summary>
/// Records the reports the administration was told about. <see cref="Around"/> wraps the real
/// notifier, so that its push notifications are still sent (to the recording push sender).
/// </summary>
public sealed class RecordingReportNotifier
{
    private readonly ConcurrentQueue<Guid> _reported = new();

    public IReadOnlyList<Guid> Reported => [.. _reported];

    public IReportNotifier Around(IReportNotifier inner) => new Recorder(this, inner);

    public void Clear() => _reported.Clear();

    private sealed class Recorder(RecordingReportNotifier owner, IReportNotifier inner) : IReportNotifier
    {
        public Task ReportCreatedAsync(Report report, CancellationToken cancellationToken)
        {
            owner._reported.Enqueue(report.Id);
            return inner.ReportCreatedAsync(report, cancellationToken);
        }
    }
}
