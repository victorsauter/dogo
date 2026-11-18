using System.Threading.Channels;

namespace Dogo.Api.Features.Notifications;

/// <summary>
/// In-process queue between the code that raises an event and the sending (ADR 0019).
/// <see cref="Enqueue"/> returns at once: requests never wait for, nor fail because of, the
/// push service. Call it only after the transaction that recorded the event has committed.
/// <see cref="NotificationDispatcher"/> reads the queue in the background.
/// </summary>
public sealed partial class NotificationQueue(ILogger<NotificationQueue> logger)
{
    /// <summary>Generous for a pilot; beyond it new notifications are dropped and logged rather than using unbounded memory.</summary>
    public const int Capacity = 10_000;

    private readonly Channel<NotificationRequest> _channel = Channel.CreateBounded<NotificationRequest>(
        new BoundedChannelOptions(Capacity) { SingleReader = true, FullMode = BoundedChannelFullMode.Wait });

    private int _pending;

    internal ChannelReader<NotificationRequest> Reader => _channel.Reader;

    /// <summary>Requests enqueued and not fully processed yet.</summary>
    public int Pending => Volatile.Read(ref _pending);

    public void Enqueue(NotificationRequest request)
    {
        if (request.RecipientIds.Count == 0)
        {
            return;
        }

        Interlocked.Increment(ref _pending);
        if (!_channel.Writer.TryWrite(request))
        {
            Interlocked.Decrement(ref _pending);
            LogDropped(request.Type, request.Subject.Id);
        }
    }

    internal void MarkProcessed() => Interlocked.Decrement(ref _pending);

    /// <summary>Waits until every enqueued request has been processed (used by tests).</summary>
    public async Task WaitUntilIdleAsync(TimeSpan timeout, CancellationToken cancellationToken = default)
    {
        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(timeout);
        while (Pending > 0)
        {
            await Task.Delay(10, timeoutSource.Token);
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Notification queue full: {Type} notification for {SubjectId} dropped")]
    private partial void LogDropped(NotificationType type, Guid subjectId);
}
