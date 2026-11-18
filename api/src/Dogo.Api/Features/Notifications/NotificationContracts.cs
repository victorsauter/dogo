using System.ComponentModel.DataAnnotations;
using Dogo.Api.Common;

namespace Dogo.Api.Features.Notifications;

public sealed record RegisterDeviceRequest
{
    /// <summary>Same rule as <c>Expo.isExpoPushToken</c> (expo-server-sdk), without spaces or brackets inside.</summary>
    public const string ExpoPushTokenPattern =
        @"^(?:(?:ExponentPushToken|ExpoPushToken)\[[^\[\]\s]+\]|[0-9A-Za-z]{8}-[0-9A-Za-z]{4}-[0-9A-Za-z]{4}-[0-9A-Za-z]{4}-[0-9A-Za-z]{12})$";

    /// <summary>
    /// Expo push token of the device: <c>ExponentPushToken[…]</c> or <c>ExpoPushToken[…]</c>
    /// (no spaces or brackets inside), or the legacy UUID form, as accepted by Expo's server SDK.
    /// </summary>
    [Required]
    [NotBlank]
    [StringLength(Device.TokenMaxLength)]
    [RegularExpression(ExpoPushTokenPattern, ErrorMessage = "The value is not an Expo push token.")]
    public required string ExpoPushToken { get; init; }

    public required DevicePlatform Platform { get; init; }
}

public sealed record DeviceResponse(string ExpoPushToken, DevicePlatform Platform, DateTimeOffset UpdatedAt);

/// <summary>Which notifications the signed-in user receives (spec §4.4). All true until changed.</summary>
public sealed record NotificationPreferencesResponse(bool Registrations, bool WalkChanges, bool Messages, bool Reminders)
{
    internal static NotificationPreferencesResponse From(NotificationPreferences preferences) =>
        new(preferences.Registrations, preferences.WalkChanges, preferences.Messages, preferences.Reminders);
}

/// <summary>Replaces all four preferences.</summary>
public sealed record UpdateNotificationPreferencesRequest
{
    /// <summary>New registrations and requests (organizer), decisions on my registrations.</summary>
    public required bool Registrations { get; init; }

    /// <summary>Changes and cancellations of walks I am registered to, next walk of a series.</summary>
    public required bool WalkChanges { get; init; }

    /// <summary>New messages in the threads I take part in.</summary>
    public required bool Messages { get; init; }

    /// <summary>Reminder 2 hours before my walks.</summary>
    public required bool Reminders { get; init; }
}
