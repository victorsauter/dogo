using System.ComponentModel.DataAnnotations;
using Dogo.Api.Common;

namespace Dogo.Api.Features.Notifications;

public sealed record RegisterDeviceRequest
{
    /// <summary>Expo push token of the device, e.g. <c>ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]</c>.</summary>
    [Required]
    [NotBlank]
    [StringLength(Device.TokenMaxLength)]
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
