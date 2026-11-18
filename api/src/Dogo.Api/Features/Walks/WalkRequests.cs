using System.ComponentModel.DataAnnotations;
using Dogo.Api.Common;
using Dogo.Api.Features.Dogs;

namespace Dogo.Api.Features.Walks;

/// <summary>A geographic point in WGS 84 degrees (GPS coordinates).</summary>
public sealed record GeoPoint
{
    [Range(-90d, 90d)]
    public required double Latitude { get; init; }

    [Range(-180d, 180d)]
    public required double Longitude { get; init; }
}

public sealed record CreateWalkRequest
{
    [Required]
    [NotBlank]
    [StringLength(Walk.TitleMaxLength, MinimumLength = Walk.TitleMinLength)]
    public required string Title { get; init; }

    [StringLength(Walk.DescriptionMaxLength)]
    public string? Description { get; init; }

    /// <summary>Must be in the future.</summary>
    [InFuture]
    public required DateTimeOffset StartsAt { get; init; }

    [Range(Walk.MinDurationMinutes, Walk.MaxDurationMinutes)]
    public int DurationMinutes { get; init; } = Walk.DefaultDurationMinutes;

    [Required]
    public required GeoPoint Location { get; init; }

    [Required]
    [NotBlank]
    [StringLength(Walk.LocationLabelMaxLength, MinimumLength = 1)]
    public required string LocationLabel { get; init; }

    [Range(Walk.MinDogs, Walk.MaxDogsLimit)]
    public required int MaxDogs { get; init; }

    /// <summary>At least one size, without duplicates.</summary>
    [Required]
    [MinLength(1)]
    [DistinctItems]
    public required List<DogSize> AllowedSizes { get; init; }

    public required LeashRule LeashRule { get; init; }

    [StringLength(Walk.RulesMaxLength)]
    public string? Rules { get; init; }

    public required WalkAccess Access { get; init; }

    /// <summary>
    /// Repeat every week (spec §4.5): when this walk starts, the next one is created seven days
    /// later at the same time (Europe/Paris), until the organizer stops the series.
    /// </summary>
    public bool RepeatWeekly { get; init; }
}

/// <summary>
/// Partial update of a walk: an omitted or null property is left unchanged. Send an empty
/// string to clear <c>description</c> or <c>rules</c>.
/// </summary>
public sealed record UpdateWalkRequest
{
    [NotBlank]
    [StringLength(Walk.TitleMaxLength, MinimumLength = Walk.TitleMinLength)]
    public string? Title { get; init; }

    /// <summary>Send an empty string to clear the description.</summary>
    [StringLength(Walk.DescriptionMaxLength)]
    public string? Description { get; init; }

    /// <summary>Must be in the future.</summary>
    [InFuture]
    public DateTimeOffset? StartsAt { get; init; }

    [Range(Walk.MinDurationMinutes, Walk.MaxDurationMinutes)]
    public int? DurationMinutes { get; init; }

    public GeoPoint? Location { get; init; }

    [NotBlank]
    [StringLength(Walk.LocationLabelMaxLength, MinimumLength = 1)]
    public string? LocationLabel { get; init; }

    /// <summary>Cannot go below the number of accepted dogs (<c>walk.capacity_below_registered</c>).</summary>
    [Range(Walk.MinDogs, Walk.MaxDogsLimit)]
    public int? MaxDogs { get; init; }

    /// <summary>At least one size, without duplicates; cannot drop the size of an accepted dog (<c>walk.size_in_use</c>).</summary>
    [MinLength(1)]
    [DistinctItems]
    public List<DogSize>? AllowedSizes { get; init; }

    public LeashRule? LeashRule { get; init; }

    /// <summary>Send an empty string to clear the rules.</summary>
    [StringLength(Walk.RulesMaxLength)]
    public string? Rules { get; init; }

    public WalkAccess? Access { get; init; }
}

public sealed record CreateRegistrationsRequest
{
    public const int MaxDogsPerRequest = 10;

    /// <summary>The signed-in user's dogs to register (1 to 10, no duplicates); all or none are registered.</summary>
    [Required]
    [Length(1, MaxDogsPerRequest)]
    [DistinctItems]
    public required List<Guid> DogIds { get; init; }
}

/// <summary><c>role</c> filter of <c>GET /me/walks</c>.</summary>
public enum MyWalksRole
{
    /// <summary>Walks I organise.</summary>
    Organizer,

    /// <summary>Walks where one of my dogs has a pending or accepted registration.</summary>
    Participant,
}

/// <summary><c>when</c> filter of <c>GET /me/walks</c>.</summary>
public enum MyWalksPeriod
{
    /// <summary>Not started yet, soonest first.</summary>
    Upcoming,

    /// <summary>Already started, most recent first.</summary>
    Past,
}
