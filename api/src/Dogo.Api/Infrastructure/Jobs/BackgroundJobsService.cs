using Dogo.Api.Common;
using Dogo.Api.Features.Auth;
using Dogo.Api.Features.Walks;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Infrastructure.Jobs;

public sealed class BackgroundJobsOptions
{
    public const string SectionName = "BackgroundJobs";

    /// <summary>Runs the scheduled jobs in this instance. Disabled in tests, which call the jobs directly.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Time between two runs.</summary>
    public TimeSpan Interval { get; set; } = TimeSpan.FromMinutes(1);

    /// <summary>Time between two purges of stale refresh tokens (<see cref="RefreshTokenPurgeJob"/>), at the first run then at most this often.</summary>
    public TimeSpan PurgeInterval { get; set; } = TimeSpan.FromHours(1);
}

/// <summary>
/// Thin periodic loop (ADR 0019): every <see cref="BackgroundJobsOptions.Interval"/>, runs the
/// reminder and weekly series jobs, and every <see cref="BackgroundJobsOptions.PurgeInterval"/>
/// the refresh token purge, each in its own scope. The logic lives in the jobs; an exception
/// is logged and the loop goes on. Safe with several instances: each job coordinates through
/// the database.
/// </summary>
public sealed partial class BackgroundJobsService(
    IOptions<BackgroundJobsOptions> options,
    IServiceScopeFactory scopeFactory,
    TimeProvider timeProvider,
    ILogger<BackgroundJobsService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var settings = options.Value;
        if (!settings.Enabled || BuildContext.IsOpenApiGeneration)
        {
            LogDisabled();
            return;
        }

        try
        {
            using var timer = new PeriodicTimer(settings.Interval, timeProvider);
            var lastPurge = DateTimeOffset.MinValue;
            do
            {
                await RunAsync<WalkSeriesJob>((job, ct) => job.RunAsync(ct), stoppingToken);
                await RunAsync<WalkReminderJob>((job, ct) => job.RunAsync(ct), stoppingToken);
                if (timeProvider.GetUtcNow() - lastPurge >= settings.PurgeInterval)
                {
                    lastPurge = timeProvider.GetUtcNow();
                    await RunAsync<RefreshTokenPurgeJob>((job, ct) => job.RunAsync(ct), stoppingToken);
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down.
        }
    }

    private async Task RunAsync<TJob>(Func<TJob, CancellationToken, Task<int>> run, CancellationToken stoppingToken)
        where TJob : notnull
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            await run(scope.ServiceProvider.GetRequiredService<TJob>(), stoppingToken);
        }
        catch (Exception e) when (!stoppingToken.IsCancellationRequested)
        {
            LogJobFailed(e, typeof(TJob).Name);
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Background jobs are disabled in this instance")]
    private partial void LogDisabled();

    [LoggerMessage(Level = LogLevel.Error, Message = "Background job {Job} failed; it runs again at the next interval")]
    private partial void LogJobFailed(Exception exception, string job);
}
