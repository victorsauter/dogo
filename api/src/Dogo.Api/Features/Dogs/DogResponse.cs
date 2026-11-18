using Dogo.Api.Features.Photos;

namespace Dogo.Api.Features.Dogs;

public sealed record DogResponse(
    Guid Id,
    Guid OwnerId,
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
    public static DogResponse From(Dog dog) => new(
        dog.Id,
        dog.OwnerId,
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
}

public static class DogQueries
{
    /// <summary>Display order of a user's dogs: oldest first.</summary>
    public static IQueryable<Dog> OrderForDisplay(this IQueryable<Dog> dogs) =>
        dogs.OrderBy(d => d.CreatedAt).ThenBy(d => d.Id);
}
