namespace Dogo.Api.Features.Notifications;

/// <summary>
/// Reads <see cref="NotificationQueue"/> and delivers each request with
/// <see cref="NotificationService"/>, one at a time, in its own scope. Failures are logged
/// and never stop the loop (notifications are best effort, ADR 0019).
/// </summary>
public sealed partial class NotificationDispatcher(
    NotificationQueue queue,
    IServiceScopeFactory scopeFactory,
    ILogger<NotificationDispatcher> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var request in queue.Reader.ReadAllAsync(stoppingToken))
            {
                try
                {
                    await using var scope = scopeFactory.CreateAsyncScope();
                    await scope.ServiceProvider.GetRequiredService<NotificationService>().DeliverAsync(request, stoppingToken);
                }
                catch (Exception e) when (!stoppingToken.IsCancellationRequested)
                {
                    LogDeliveryFailed(e, request.Type, request.Subject.Id);
                }
                finally
                {
                    queue.MarkProcessed();
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down: notifications still queued are lost (best effort).
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Sending the {Type} notification for {SubjectId} failed")]
    private partial void LogDeliveryFailed(Exception exception, NotificationType type, Guid subjectId);
}
