namespace Dogo.Api.Infrastructure.Push;

/// <summary>Writes each notification to the log instead of sending it (<c>Notifications:Provider</c> = <c>Log</c>).</summary>
public sealed partial class LoggingPushSender(ILogger<LoggingPushSender> logger) : IPushSender
{
    public Task<PushResult> SendAsync(IReadOnlyList<PushMessage> messages, CancellationToken cancellationToken)
    {
        foreach (var message in messages)
        {
            // The token is not logged: it lets anyone send notifications to the device.
            LogPush(message.UserId, message.Title, message.Body, string.Join(", ", message.Data.Select(d => $"{d.Key}={d.Value}")));
        }

        return Task.FromResult(PushResult.Empty);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Push notification (not sent, log provider) to user {UserId}: {Title} | {Body} | {Data}")]
    private partial void LogPush(Guid userId, string title, string body, string data);
}
