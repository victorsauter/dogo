namespace Dogo.Api.Infrastructure.Push;

public enum PushProvider
{
    /// <summary>Only logs what would be sent (default; development and tests).</summary>
    Log,

    /// <summary>Sends through Expo's push service.</summary>
    Expo,
}

public sealed class PushOptions
{
    public const string SectionName = "Notifications";

    public PushProvider Provider { get; set; } = PushProvider.Log;

    public ExpoPushOptions Expo { get; set; } = new();
}

public sealed class ExpoPushOptions
{
    public const string DefaultSendUrl = "https://exp.host/--/api/v2/push/send";

    public string SendUrl { get; set; } = DefaultSendUrl;

    /// <summary>
    /// Expo access token, required only when "enhanced security for push notifications" is
    /// enabled for the project. Set through the <c>Notifications__Expo__AccessToken</c> environment variable.
    /// </summary>
    public string? AccessToken { get; set; }
}
