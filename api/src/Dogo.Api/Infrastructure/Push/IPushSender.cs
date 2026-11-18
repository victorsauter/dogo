namespace Dogo.Api.Infrastructure.Push;

/// <summary>One push notification to one device.</summary>
/// <param name="UserId">Owner of the device; used for logging only, never sent.</param>
/// <param name="Token">Expo push token of the device (<c>ExponentPushToken[…]</c>).</param>
/// <param name="Data">Payload read by the app when the notification is opened.</param>
public sealed record PushMessage(Guid UserId, string Token, string Title, string Body, IReadOnlyDictionary<string, string> Data);

/// <summary>Outcome of a send: the tokens the push service reported as no longer registered.</summary>
public sealed record PushResult(IReadOnlyCollection<string> UnregisteredTokens)
{
    public static PushResult Empty { get; } = new([]);
}

/// <summary>
/// Sends push notifications (spec §6: behind an interface). <see cref="ExpoPushSender"/> uses
/// Expo's push service, <see cref="LoggingPushSender"/> only logs. Implementations do not throw
/// for a rejected message; they log it and report unregistered devices in the result.
/// </summary>
public interface IPushSender
{
    Task<PushResult> SendAsync(IReadOnlyList<PushMessage> messages, CancellationToken cancellationToken);
}
