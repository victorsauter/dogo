using Dogo.Api.Features.Photos;
using Dogo.Api.Features.Users;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Features.Dogs;

/// <summary>A human linked to a dog, with their role (ADR 0042).</summary>
public sealed record DogMemberResponse(UserSummaryResponse User, DogMemberRole Role);

public sealed record DogResponse(
    Guid Id,
    IReadOnlyList<DogMemberResponse> Members,
    string Name,
    string? PhotoUrl,
    DogSize Size,
    DateOnly? BirthDate,
    string? Breed,
    Sociability Sociability,
    Reactivity Reactivity,
    LeashHabit LeashHabit,
    string Description,
    DateTimeOffset CreatedAt)
{
    /// <summary>
    /// Requires <see cref="Dog.Owner"/> to be loaded. While a dog has a single owner (<c>Dog.OwnerId</c>),
    /// <c>members</c> holds exactly that owner with the <c>Owner</c> role.
    /// </summary>
    public static DogResponse From(Dog dog) => new(
        dog.Id,
        MembersOf(dog),
        dog.Name,
        PhotoUrls.For(dog.PhotoFileName),
        dog.Size,
        dog.BirthDate,
        dog.Breed,
        dog.Sociability,
        dog.Reactivity,
        dog.LeashHabit,
        dog.Description,
        dog.CreatedAt);

    /// <summary>The humans linked to the dog, oldest link first. Requires <see cref="Dog.Owner"/> to be loaded.</summary>
    internal static IReadOnlyList<DogMemberResponse> MembersOf(Dog dog) =>
        [new DogMemberResponse(UserSummaryResponse.From(dog.Owner), DogMemberRole.Owner)];
}

public static class DogQueries
{
    /// <summary>Display order of a user's dogs: oldest first.</summary>
    public static IQueryable<Dog> OrderForDisplay(this IQueryable<Dog> dogs) =>
        dogs.OrderBy(d => d.CreatedAt).ThenBy(d => d.Id);

    /// <summary>Loads the owner that <see cref="DogResponse.From"/> needs, in the same query.</summary>
    public static IQueryable<Dog> WithMembers(this IQueryable<Dog> dogs) => dogs.Include(d => d.Owner);
}
