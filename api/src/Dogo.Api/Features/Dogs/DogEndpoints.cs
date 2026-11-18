using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Dogo.Api.Common;
using Dogo.Api.Features.Walks;
using Dogo.Api.Infrastructure.Persistence;
using Dogo.Api.Infrastructure.Storage;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Features.Dogs;

public static class DogEndpoints
{
    public const int DefaultListLimit = 50;
    public const int MaxListLimit = 100;

    public static IEndpointRouteBuilder MapDogEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("").WithTags("Dogs");

        group.MapGet("/me/dogs", ListMyDogs)
            .WithName("listMyDogs")
            .WithSummary("List the signed-in user's dogs.")
            .ProducesValidationProblem();

        group.MapPost("/dogs", CreateDog)
            .WithName("createDog")
            .WithSummary("Create a dog owned by the signed-in user.")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden);

        group.MapGet("/dogs/{id:guid}", GetDog)
            .WithName("getDog")
            .WithSummary("Get a dog.")
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPatch("/dogs/{id:guid}", UpdateDog)
            .WithName("updateDog")
            .WithSummary("Update one of the signed-in user's dogs.")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapDelete("/dogs/{id:guid}", DeleteDog)
            .WithName("deleteDog")
            .WithSummary("Delete one of the signed-in user's dogs.")
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);

        return routes;
    }

    private static async Task<Ok<List<DogResponse>>> ListMyDogs(
        ClaimsPrincipal principal,
        DogoDbContext db,
        CancellationToken cancellationToken,
        [Range(1, MaxListLimit)] int limit = DefaultListLimit)
    {
        var userId = principal.GetUserId();
        var dogs = await db.Dogs.AsNoTracking()
            .Where(d => d.OwnerId == userId)
            .OrderForDisplay()
            .Take(limit)
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(dogs.Select(DogResponse.From).ToList());
    }

    private static async Task<Created<DogResponse>> CreateDog(
        CreateDogRequest request, ClaimsPrincipal principal, DogoDbContext db, CancellationToken cancellationToken)
    {
        var dog = new Dog
        {
            OwnerId = principal.GetUserId(),
            Name = request.Name.Trim(),
            Size = request.Size,
            BirthDate = request.BirthDate,
            Breed = NullIfBlank(request.Breed),
            Sociability = request.Sociability,
            Reactivity = request.Reactivity,
            LeashHabit = request.LeashHabit,
            Description = request.Description?.Trim() ?? "",
        };
        db.Dogs.Add(dog);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Created($"/api/v1/dogs/{dog.Id}", DogResponse.From(dog));
    }

    private static async Task<Results<Ok<DogResponse>, ProblemHttpResult>> GetDog(
        Guid id, DogoDbContext db, CancellationToken cancellationToken)
    {
        var dog = await db.Dogs.AsNoTracking().SingleOrDefaultAsync(d => d.Id == id, cancellationToken);
        return dog is null ? DogNotFound() : TypedResults.Ok(DogResponse.From(dog));
    }

    private static async Task<Results<Ok<DogResponse>, ProblemHttpResult>> UpdateDog(
        Guid id, UpdateDogRequest request, ClaimsPrincipal principal, DogoDbContext db, CancellationToken cancellationToken)
    {
        var (dog, problem) = await FindOwnedDogAsync(db, id, principal, cancellationToken);
        if (dog is null)
        {
            return problem!;
        }

        if (request.Name is not null)
        {
            dog.Name = request.Name.Trim();
        }

        if (request.Size is { } size)
        {
            dog.Size = size;
        }

        if (request.BirthDateSpecified)
        {
            dog.BirthDate = request.BirthDate;
        }

        if (request.BreedSpecified)
        {
            dog.Breed = NullIfBlank(request.Breed);
        }

        if (request.Sociability is { } sociability)
        {
            dog.Sociability = sociability;
        }

        if (request.Reactivity is { } reactivity)
        {
            dog.Reactivity = reactivity;
        }

        if (request.LeashHabit is { } leashHabit)
        {
            dog.LeashHabit = leashHabit;
        }

        if (request.Description is not null)
        {
            dog.Description = request.Description.Trim();
        }

        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(DogResponse.From(dog));
    }

    private static async Task<Results<NoContent, ProblemHttpResult>> DeleteDog(
        Guid id,
        ClaimsPrincipal principal,
        DogoDbContext db,
        IPhotoStorage photos,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var (dog, problem) = await FindOwnedDogAsync(db, id, principal, cancellationToken);
        if (dog is null)
        {
            return problem!;
        }

        // Spec §4.1: deleting a dog cancels its upcoming registrations, which frees their places.
        // Registrations of past walks are kept as history; the foreign key sets their dog to null.
        var now = timeProvider.GetUtcNow();
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.Registrations
            .Where(r => r.DogId == id
                && (r.Status == RegistrationStatus.Pending || r.Status == RegistrationStatus.Accepted)
                && r.Walk.StartsAt > now)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, RegistrationStatus.Cancelled), cancellationToken);
        db.Dogs.Remove(dog);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        if (dog.PhotoFileName is not null)
        {
            await photos.DeleteAsync(dog.PhotoFileName, cancellationToken);
        }

        return TypedResults.NoContent();
    }

    /// <summary>
    /// Loads a dog for modification by the signed-in user: 404 <c>dog.not_found</c> when it
    /// does not exist, 403 <c>dog.forbidden</c> when someone else owns it (spec §4.1).
    /// </summary>
    internal static async Task<(Dog? Dog, ProblemHttpResult? Problem)> FindOwnedDogAsync(
        DogoDbContext db, Guid id, ClaimsPrincipal principal, CancellationToken cancellationToken)
    {
        var dog = await db.Dogs.SingleOrDefaultAsync(d => d.Id == id, cancellationToken);
        if (dog is null)
        {
            return (null, DogNotFound());
        }

        return dog.OwnerId == principal.GetUserId()
            ? (dog, null)
            : (null, Problems.Forbidden(ErrorCodes.DogForbidden, "Only the owner can modify this dog."));
    }

    private static ProblemHttpResult DogNotFound() => Problems.NotFound(ErrorCodes.DogNotFound, "The dog does not exist.");

    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
