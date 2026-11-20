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
            .WithSummary("Create a dog owned by the signed-in user (20 dogs at most per account).")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapGet("/dogs/{id:guid}", GetDog)
            .WithName("getDog")
            .WithSummary("Get a dog.")
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPatch("/dogs/{id:guid}", UpdateDog)
            .WithName("updateDog")
            .WithSummary("Update one of the signed-in user's dogs. The size cannot change while the dog is registered to an upcoming walk that does not allow the new size.")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

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
            .WithMembers()
            .Where(d => d.OwnerId == userId)
            .OrderForDisplay()
            .Take(limit)
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(dogs.Select(DogResponse.From).ToList());
    }

    private static async Task<Results<Created<DogResponse>, ProblemHttpResult>> CreateDog(
        CreateDogRequest request, ClaimsPrincipal principal, DogoDbContext db, CancellationToken cancellationToken)
    {
        // The owner's row is locked so that concurrent creations cannot pass the limit together.
        var ownerId = principal.GetUserId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.Database.SqlQuery<Guid>($"SELECT id AS \"Value\" FROM users WHERE id = {ownerId} FOR UPDATE").ToListAsync(cancellationToken);
        if (await db.Dogs.CountAsync(d => d.OwnerId == ownerId, cancellationToken) >= Dog.MaxPerOwner)
        {
            return Problems.Conflict(ErrorCodes.DogLimitReached, $"An account cannot have more than {Dog.MaxPerOwner} dogs.");
        }

        var owner = await db.Users.SingleAsync(u => u.Id == ownerId, cancellationToken);
        var dog = new Dog
        {
            Owner = owner,
            OwnerId = ownerId,
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
        await transaction.CommitAsync(cancellationToken);
        return TypedResults.Created($"/api/v1/dogs/{dog.Id}", DogResponse.From(dog));
    }

    private static async Task<Results<Ok<DogResponse>, ProblemHttpResult>> GetDog(
        Guid id, DogoDbContext db, CancellationToken cancellationToken)
    {
        var dog = await db.Dogs.AsNoTracking().WithMembers().SingleOrDefaultAsync(d => d.Id == id, cancellationToken);
        return dog is null ? DogNotFound() : TypedResults.Ok(DogResponse.From(dog));
    }

    private static async Task<Results<Ok<DogResponse>, ProblemHttpResult>> UpdateDog(
        Guid id,
        UpdateDogRequest request,
        ClaimsPrincipal principal,
        DogoDbContext db,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        // The dog row is locked: a registration of this dog running at the same time (which
        // share-locks it) either finishes before the check below, or reads the new size.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var (dog, problem) = await FindOwnedDogAsync(db, id, principal, cancellationToken, forUpdate: true);
        if (dog is null)
        {
            return problem!;
        }

        // A dog cannot take a size that one of the walks it is registered to does not allow.
        var now = timeProvider.GetUtcNow();
        if (request.Size is { } newSize && newSize != dog.Size
            && await db.Registrations.AnyAsync(
                r => r.DogId == id
                    && (r.Status == RegistrationStatus.Pending || r.Status == RegistrationStatus.Accepted)
                    && r.Walk.Status == WalkStatus.Scheduled
                    && r.Walk.StartsAt > now
                    && !r.Walk.AllowedSizes.Contains(newSize),
                cancellationToken))
        {
            return Problems.Conflict(ErrorCodes.DogSizeInUse, "The dog is registered to an upcoming walk that does not allow this size.");
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
        await transaction.CommitAsync(cancellationToken);
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
        // The dog row is locked first (ADR 0037): a registration of this dog running at the same
        // time share-locks it, so it either commits before the update below, which then cancels
        // it, or waits and finds no dog. An acceptance racing the update only accepts a
        // registration still pending, and the update below cancels an accepted one.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var (dog, problem) = await FindOwnedDogAsync(db, id, principal, cancellationToken, forUpdate: true);
        if (dog is null)
        {
            return problem!;
        }

        // Spec §4.1: deleting a dog cancels its upcoming registrations, which frees their places.
        // Registrations of past walks are kept as history; the foreign key sets their dog to null.
        var now = timeProvider.GetUtcNow();
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
    /// <param name="forUpdate">Locks the dog row (<c>SELECT … FOR UPDATE</c>) until the current transaction ends.</param>
    internal static async Task<(Dog? Dog, ProblemHttpResult? Problem)> FindOwnedDogAsync(
        DogoDbContext db, Guid id, ClaimsPrincipal principal, CancellationToken cancellationToken, bool forUpdate = false)
    {
        var dog = forUpdate
            ? (await db.Dogs.FromSql($"SELECT * FROM dogs WHERE id = {id} FOR UPDATE").ToListAsync(cancellationToken)).SingleOrDefault()
            : await db.Dogs.SingleOrDefaultAsync(d => d.Id == id, cancellationToken);
        if (dog is null)
        {
            return (null, DogNotFound());
        }

        if (dog.OwnerId != principal.GetUserId())
        {
            return (null, Problems.Forbidden(ErrorCodes.DogForbidden, "Only the owner can modify this dog."));
        }

        // The caller is the owner, and the dog's response needs the owner: loaded once.
        await db.Entry(dog).Reference(d => d.Owner).LoadAsync(cancellationToken);
        return (dog, null);
    }

    private static ProblemHttpResult DogNotFound() => Problems.NotFound(ErrorCodes.DogNotFound, "The dog does not exist.");

    private static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
