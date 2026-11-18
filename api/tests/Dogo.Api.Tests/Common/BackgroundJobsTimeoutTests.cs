using System.Diagnostics;
using Dogo.Api.Infrastructure.Jobs;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Tests.Common;

/// <summary>Each run of a background job has a time limit: a stuck job cannot freeze the loop.</summary>
public sealed class BackgroundJobsTimeoutTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static BackgroundJobsService CreateService(TimeSpan timeout)
    {
        var services = new ServiceCollection().BuildServiceProvider();
        return new BackgroundJobsService(
            Options.Create(new BackgroundJobsOptions { JobTimeout = timeout }),
            services.GetRequiredService<IServiceScopeFactory>(),
            TimeProvider.System,
            NullLogger<BackgroundJobsService>.Instance);
    }

    [Fact]
    public async Task A_job_that_ignores_cancellation_is_abandoned_after_the_timeout()
    {
        var service = CreateService(TimeSpan.FromMilliseconds(200));
        var release = new TaskCompletionSource();
        var watch = Stopwatch.StartNew();

        // Ignores its token, like a call stuck on the network.
        await service.RunJobAsync("stuck", (_, _) => release.Task, Ct);

        Assert.InRange(watch.Elapsed, TimeSpan.FromMilliseconds(150), TimeSpan.FromSeconds(5));
        release.SetResult();
    }

    [Fact]
    public async Task A_job_that_honours_cancellation_is_cancelled_after_the_timeout()
    {
        var service = CreateService(TimeSpan.FromMilliseconds(200));
        var cancelled = new TaskCompletionSource();

        await service.RunJobAsync("slow", async (_, ct) =>
        {
            try
            {
                await Task.Delay(Timeout.Infinite, ct);
            }
            catch (OperationCanceledException)
            {
                cancelled.SetResult();
                throw;
            }
        }, Ct);

        // The job saw its token cancelled (the loop may have stopped waiting a moment before).
        await cancelled.Task.WaitAsync(TimeSpan.FromSeconds(5), Ct);
    }

    [Fact]
    public async Task A_failing_job_does_not_throw_out_of_the_loop()
    {
        var service = CreateService(TimeSpan.FromSeconds(5));

        await service.RunJobAsync("failing", (_, _) => throw new InvalidOperationException("boom"), Ct);
        await service.RunJobAsync("failing-async", async (_, _) =>
        {
            await Task.Yield();
            throw new InvalidOperationException("boom");
        }, Ct);
    }
}
