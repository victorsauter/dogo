using Dogo.Api.Features.Dogs;
using Dogo.Api.Features.Organizations;
using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using NetTopologySuite.Geometries;

namespace Dogo.Api.Features.Walks;

public enum LeashRule
{
    LeashRequired,
    OffLeashAllowed,
}

public enum WalkAccess
{
    Open,
    Approval,
}

public enum WalkStatus
{
    Scheduled,
    Cancelled,
}

public sealed class Walk : IHasCreatedAt
{
    public const int TitleMinLength = 3;
    public const int TitleMaxLength = 80;
    public const int DescriptionMaxLength = 2000;
    public const int LocationLabelMaxLength = 120;
    public const int RulesMaxLength = 1000;
    public const int MinDurationMinutes = 15;
    public const int MaxDurationMinutes = 480;
    public const int DefaultDurationMinutes = 60;
    public const int MinDogs = 1;
    public const int MaxDogsLimit = 50;

    /// <summary>WGS 84, the reference system of GPS coordinates.</summary>
    public const int Srid = 4326;

    public Guid Id { get; init; } = Guid.CreateVersion7();

    /// <summary>
    /// Null once the organizer's account has been deleted (spec §4.8): their upcoming walks are
    /// cancelled first, and every walk is kept for its participants' history and threads.
    /// </summary>
    public Guid? OrganizerId { get; init; }

    public User? Organizer { get; init; }

    public required string Title { get; set; }

    public string Description { get; set; } = "";

    public DateTimeOffset StartsAt { get; set; }

    public int DurationMinutes { get; set; } = DefaultDurationMinutes;

    /// <summary>Meeting point (X = longitude, Y = latitude), stored as <c>geography(Point, 4326)</c>.</summary>
    public required Point Location { get; set; }

    public required string LocationLabel { get; set; }

    public int MaxDogs { get; set; }

    /// <summary>At least one size, without duplicates, kept in enum order.</summary>
    public List<DogSize> AllowedSizes { get; set; } = [];

    public LeashRule LeashRule { get; set; }

    public string Rules { get; set; } = "";

    public WalkAccess Access { get; set; }

    public WalkStatus Status { get; set; } = WalkStatus.Scheduled;

    /// <summary>Weekly series the walk belongs to (spec §4.5), if any.</summary>
    public Guid? SeriesId { get; init; }

    public WalkSeries? Series { get; init; }

    /// <summary>
    /// When the reminder (2 hours before the start, spec §4.4) was claimed for sending. Set
    /// atomically by <see cref="WalkReminderJob"/> so that each reminder is sent at most once,
    /// even with several instances or after a restart; cleared when the start time changes.
    /// </summary>
    public DateTimeOffset? ReminderSentAt { get; set; }

    /// <summary>
    /// Organisation carrying a professional walk (spec §4.6): registration is reserved to its
    /// accepted members. Set at creation, never changed afterwards.
    /// </summary>
    public Guid? OrganizationId { get; init; }

    public Organization? Organization { get; init; }

    public DateTimeOffset CreatedAt { get; set; }

    public List<Registration> Registrations { get; } = [];

    /// <summary>
    /// Registrations, changes and cancellation are only possible on a scheduled walk that
    /// has not started yet (spec §4.2, §4.3 <c>walk.not_open</c>).
    /// </summary>
    public bool IsOpen(DateTimeOffset now) => Status == WalkStatus.Scheduled && StartsAt > now;

    public bool HasStarted(DateTimeOffset now) => StartsAt <= now;

    /// <summary>The organizer as notification recipients: none once their account has been deleted.</summary>
    public IReadOnlyCollection<Guid> OrganizerRecipients() => OrganizerId is { } organizerId ? [organizerId] : [];

    public static Point CreatePoint(double latitude, double longitude) => new(longitude, latitude) { SRID = Srid };
}

internal sealed class WalkConfiguration : IEntityTypeConfiguration<Walk>
{
    public void Configure(EntityTypeBuilder<Walk> builder)
    {
        builder.Property(w => w.Title).HasMaxLength(Walk.TitleMaxLength);
        builder.Property(w => w.Description).HasMaxLength(Walk.DescriptionMaxLength);
        builder.Property(w => w.LocationLabel).HasMaxLength(Walk.LocationLabelMaxLength);
        builder.Property(w => w.Rules).HasMaxLength(Walk.RulesMaxLength);

        // Geography: distances in metres on the spheroid; GiST index for ST_DWithin searches.
        builder.Property(w => w.Location).HasColumnType("geography(Point, 4326)");
        builder.HasIndex(w => w.Location).HasMethod("gist");

        // Stored as text[] of enum names, like the other enums.
        builder.PrimitiveCollection(w => w.AllowedSizes).ElementType(e => e.HasConversion<string>());

        builder.HasIndex(w => w.StartsAt);
        builder.HasIndex(w => w.OrganizerId);
        builder.HasOne(w => w.Organizer).WithMany().HasForeignKey(w => w.OrganizerId).OnDelete(DeleteBehavior.SetNull);
        builder.HasIndex(w => new { w.OrganizationId, w.StartsAt });
        builder.HasOne(w => w.Organization).WithMany().HasForeignKey(w => w.OrganizationId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(w => new { w.SeriesId, w.StartsAt });
        builder.HasOne(w => w.Series).WithMany().HasForeignKey(w => w.SeriesId).OnDelete(DeleteBehavior.SetNull);
    }
}
