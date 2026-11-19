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

    /// <summary>Longest run of one job; past it the job is cancelled and the loop goes on, so one stuck job cannot freeze the others.</summary>
    public TimeSpan JobTimeout { get; set; } = TimeSpan.FromMinutes(2);
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

    private Task RunAsync<TJob>(Func<TJob, CancellationToken, Task<int>> run, CancellationToken stoppingToken)
        where TJob : notnull =>
        RunJobAsync(typeof(TJob).Name, (services, ct) => run(services.GetRequiredService<TJob>(), ct), stoppingToken);

    /// <summary>
    /// Runs one job in its own scope, for at most <see cref="BackgroundJobsOptions.JobTimeout"/>.
    /// Past it the job's token is cancelled and the loop stops waiting, even for a job that
    /// ignores its token (a hung database call, say): the scope is then disposed when that
    /// job finally ends. A job run again while an abandoned run still goes is safe, because
    /// every job coordinates through the database.
    /// </summary>
    internal async Task RunJobAsync(string name, Func<IServiceProvider, CancellationToken, Task> run, CancellationToken stoppingToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
        timeout.CancelAfter(options.Value.JobTimeout);
        var scope = scopeFactory.CreateAsyncScope();
        Task job;
        try
        {
            job = run(scope.ServiceProvider, timeout.Token);
        }
        catch (Exception e)
        {
            await scope.DisposeAsync();
            if (!stoppingToken.IsCancellationRequested)
            {
                LogJobFailed(e, name);
            }

            return;
        }

        try
        {
            await job.WaitAsync(timeout.Token);
        }
        catch (OperationCanceledException) when (timeout.IsCancellationRequested && !stoppingToken.IsCancellationRequested)
        {
            LogJobTimedOut(name, options.Value.JobTimeout);
        }
        catch (Exception e) when (!stoppingToken.IsCancellationRequested)
        {
            LogJobFailed(e, name);
        }
        finally
        {
            if (job.IsCompleted)
            {
                await scope.DisposeAsync();
            }
            else
            {
                // Abandoned: dispose the scope (and its database connection) once the job ends.
                _ = job.ContinueWith(
                    static (_, state) => ((AsyncServiceScope)state!).DisposeAsync().AsTask(),
                    scope,
                    CancellationToken.None,
                    TaskContinuationOptions.None,
                    TaskScheduler.Default).Unwrap();
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Background jobs are disabled in this instance")]
    private partial void LogDisabled();

    [LoggerMessage(Level = LogLevel.Error, Message = "Background job {Job} did not finish within {Timeout}; abandoned until the next interval")]
    private partial void LogJobTimedOut(string job, TimeSpan timeout);

    [LoggerMessage(Level = LogLevel.Error, Message = "Background job {Job} failed; it runs again at the next interval")]
    private partial void LogJobFailed(Exception exception, string job);
}
