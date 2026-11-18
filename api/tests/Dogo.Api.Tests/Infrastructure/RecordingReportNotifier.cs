using System.Collections.Concurrent;
using Dogo.Api.Features.Reports;

namespace Dogo.Api.Tests.Infrastructure;

/// <summary>Records the reports the administration would have been told about.</summary>
public sealed class RecordingReportNotifier : IReportNotifier
{
    private readonly ConcurrentQueue<Guid> _reported = new();

    public IReadOnlyList<Guid> Reported => [.. _reported];

    public Task ReportCreatedAsync(Report report, CancellationToken cancellationToken)
    {
        _reported.Enqueue(report.Id);
        return Task.CompletedTask;
    }

    public void Clear() => _reported.Clear();
}
