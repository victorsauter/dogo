using Dogo.Api.Features.Users;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Dogo.Api.Features.Notifications;

public enum DevicePlatform
{
    Ios,
    Android,
}

/// <summary>
/// A phone that receives push notifications. A token belongs to one user at a time:
/// registering it for another user moves it (unique index on the token).
/// </summary>
public sealed class Device
{
    public const int TokenMaxLength = 255;

    public Guid Id { get; init; } = Guid.CreateVersion7();

    public Guid UserId { get; set; }

    /// <summary>Expo push token, e.g. <c>ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]</c>.</summary>
    public required string ExpoPushToken { get; init; }

    public DevicePlatform Platform { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}

internal sealed class DeviceConfiguration : IEntityTypeConfiguration<Device>
{
    public void Configure(EntityTypeBuilder<Device> builder)
    {
        builder.Property(d => d.ExpoPushToken).HasMaxLength(Device.TokenMaxLength);
        builder.HasIndex(d => d.ExpoPushToken).IsUnique();
        builder.HasIndex(d => d.UserId);
        builder.HasOne<User>().WithMany().HasForeignKey(d => d.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
