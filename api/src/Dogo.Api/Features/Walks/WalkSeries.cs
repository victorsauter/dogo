using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Dogo.Api.Features.Walks;

/// <summary>
/// Weekly recurrence of a walk (spec §4.5). While it is active, the next walk is created
/// seven days after the latest one, at the same local time in <see cref="TimeZone"/>, once
/// the latest one has started (<see cref="WalkSeriesJob"/>).
/// </summary>
public sealed class WalkSeries : IHasCreatedAt
{
    /// <summary>The pilot is in France (spec §7).</summary>
    public const string DefaultTimeZone = "Europe/Paris";

    public Guid Id { get; init; } = Guid.CreateVersion7();

    public Guid OrganizerId { get; init; }

    /// <summary>IANA time zone id in which the local time of day is kept across daylight-saving changes.</summary>
    public string TimeZone { get; init; } = DefaultTimeZone;

    /// <summary>False once the organizer stopped the series. Cancelling a walk does not stop it.</summary>
    public bool Active { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class WalkSeriesConfiguration : IEntityTypeConfiguration<WalkSeries>
{
    public void Configure(EntityTypeBuilder<WalkSeries> builder)
    {
        builder.Property(s => s.TimeZone).HasMaxLength(64);
        builder.HasIndex(s => s.OrganizerId);
        builder.HasOne<User>().WithMany().HasForeignKey(s => s.OrganizerId).OnDelete(DeleteBehavior.Cascade);
    }
}
