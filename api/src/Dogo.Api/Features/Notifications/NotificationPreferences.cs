using Dogo.Api.Features.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Dogo.Api.Features.Notifications;

/// <summary>
/// Which kinds of notifications a user receives (spec §3, §4.4). Everything is on by default:
/// a row exists only once the user changed their preferences.
/// </summary>
public sealed class NotificationPreferences
{
    public Guid UserId { get; init; }

    public bool Registrations { get; set; } = true;

    public bool WalkChanges { get; set; } = true;

    public bool Messages { get; set; } = true;

    public bool Reminders { get; set; } = true;

    public bool Allows(NotificationCategory category) => category switch
    {
        NotificationCategory.Registrations => Registrations,
        NotificationCategory.WalkChanges => WalkChanges,
        NotificationCategory.Messages => Messages,
        NotificationCategory.Reminders => Reminders,
        // Not a walk notification: no preference turns it off (ADR 0036).
        NotificationCategory.Administration => true,
        _ => throw new ArgumentOutOfRangeException(nameof(category), category, null),
    };
}

internal sealed class NotificationPreferencesConfiguration : IEntityTypeConfiguration<NotificationPreferences>
{
    public void Configure(EntityTypeBuilder<NotificationPreferences> builder)
    {
        builder.HasKey(p => p.UserId);
        builder.HasOne<User>().WithOne().HasForeignKey<NotificationPreferences>(p => p.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
