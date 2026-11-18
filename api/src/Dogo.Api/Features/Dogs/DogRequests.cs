using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Dogo.Api.Common;

namespace Dogo.Api.Features.Dogs;

public sealed record CreateDogRequest
{
    [Required]
    [StringLength(Dog.NameMaxLength, MinimumLength = 1)]
    public required string Name { get; init; }

    public required DogSize Size { get; init; }

    [NotInFuture]
    public DateOnly? BirthDate { get; init; }

    [StringLength(Dog.BreedMaxLength)]
    public string? Breed { get; init; }

    public required Sociability Sociability { get; init; }

    public required Reactivity Reactivity { get; init; }

    public required LeashHabit LeashHabit { get; init; }

    [StringLength(Dog.DescriptionMaxLength)]
    public string? Description { get; init; }
}

/// <summary>
/// Partial update of a dog: an omitted property is left unchanged. A null value also
/// leaves required properties unchanged, but clears the optional <c>birthDate</c> and <c>breed</c>.
/// </summary>
public sealed record UpdateDogRequest
{
    private readonly DateOnly? _birthDate;
    private readonly string? _breed;

    [NotBlank]
    [StringLength(Dog.NameMaxLength, MinimumLength = 1)]
    public string? Name { get; init; }

    public DogSize? Size { get; init; }

    /// <summary>Null clears the birth date.</summary>
    [NotInFuture]
    public DateOnly? BirthDate
    {
        get => _birthDate;
        init
        {
            _birthDate = value;
            BirthDateSpecified = true;
        }
    }

    /// <summary>Null clears the breed.</summary>
    [StringLength(Dog.BreedMaxLength)]
    public string? Breed
    {
        get => _breed;
        init
        {
            _breed = value;
            BreedSpecified = true;
        }
    }

    public Sociability? Sociability { get; init; }

    public Reactivity? Reactivity { get; init; }

    public LeashHabit? LeashHabit { get; init; }

    /// <summary>Send an empty string to clear the description.</summary>
    [StringLength(Dog.DescriptionMaxLength)]
    public string? Description { get; init; }

    [JsonIgnore]
    public bool BirthDateSpecified { get; private init; }

    [JsonIgnore]
    public bool BreedSpecified { get; private init; }
}
