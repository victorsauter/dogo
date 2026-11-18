using System.Security.Claims;
using Dogo.Api.Common;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Dogo.Api.Features.Walks;

public static class RegistrationEndpoints
{
    public static IEndpointRouteBuilder MapRegistrationEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/walks/{id:guid}/registrations").WithTags("Registrations");

        group.MapPost("", CreateRegistrations)
            .WithName("createRegistrations")
            .WithSummary("Register one or more of the signed-in user's dogs to a walk; all or none are registered.")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapDelete("/{registrationId:guid}", CancelRegistration)
            .WithName("cancelRegistration")
            .WithSummary("Cancel one of the signed-in user's registrations before the walk starts. Idempotent.")
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapPost("/{registrationId:guid}/accept", AcceptRegistration)
            .WithName("acceptRegistration")
            .WithSummary("Accept a pending registration (organizer only). Capacity is checked again.")
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapPost("/{registrationId:guid}/decline", DeclineRegistration)
            .WithName("declineRegistration")
            .WithSummary("Decline a pending registration or remove an accepted participant (organizer only).")
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        return routes;
    }

    private static async Task<Results<Created<List<RegistrationResponse>>, ProblemHttpResult>> CreateRegistrations(
        Guid id,
        CreateRegistrationsRequest request,
        ClaimsPrincipal principal,
        DogoDbContext db,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var userId = principal.GetUserId();

        // The walk row lock serialises registrations to the same walk: capacity and duplicate
        // checks below see every registration committed before them.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var walk = await db.LockWalkAsync(id, cancellationToken);
        if (walk is null)
        {
            return WalkEndpoints.WalkNotFound();
        }

        var attempt = new RegistrationAttempt(walk, userId, request.DogIds, timeProvider.GetUtcNow());
        var problem = await RegistrationRules.CheckAsync(db, attempt, cancellationToken);
        if (problem is not null)
        {
            return problem;
        }

        var status = attempt.InitialStatus;
        var registrations = request.DogIds
            .Select(dogId => new Registration { WalkId = walk.Id, DogId = dogId, UserId = userId, Status = status })
            .ToList();
        db.Registrations.AddRange(registrations);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: Registration.ActiveDogIndexName })
        {
            // Not expected while the walk is locked; the partial unique index is the last line of defence.
            return RegistrationRules.Duplicate();
        }

        await transaction.CommitAsync(cancellationToken);

        // Lot 3 notifies the organizer of the new registration or request here (spec §4.4).
        return TypedResults.Created((string?)null, registrations.Select(RegistrationResponse.From).ToList());
    }

    private static async Task<Results<NoContent, ProblemHttpResult>> CancelRegistration(
        Guid id, Guid registrationId, ClaimsPrincipal principal, DogoDbContext db, TimeProvider timeProvider, CancellationToken cancellationToken)
    {
        var registration = await db.Registrations.Include(r => r.Walk)
            .SingleOrDefaultAsync(r => r.Id == registrationId && r.WalkId == id, cancellationToken);
        if (registration is null)
        {
            return RegistrationNotFound();
        }

        if (registration.UserId != principal.GetUserId())
        {
            return Problems.Forbidden(ErrorCodes.RegistrationForbidden, "Only the owner of the dog can cancel this registration.");
        }

        if (registration.Status == RegistrationStatus.Cancelled)
        {
            return TypedResults.NoContent();
        }

        if (registration.Walk.HasStarted(timeProvider.GetUtcNow()))
        {
            return RegistrationRules.NotOpen();
        }

        if (!registration.IsActive)
        {
            return NotActive();
        }

        // Frees the place at once (only accepted registrations count).
        registration.Status = RegistrationStatus.Cancelled;
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Results<Ok<RegistrationResponse>, ProblemHttpResult>> AcceptRegistration(
        Guid id, Guid registrationId, ClaimsPrincipal principal, DogoDbContext db, TimeProvider timeProvider, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var (walk, registration, problem) = await LockForDecisionAsync(db, id, registrationId, principal.GetUserId(), cancellationToken);
        if (registration is null)
        {
            return problem!;
        }

        if (registration.Status == RegistrationStatus.Accepted)
        {
            return TypedResults.Ok(RegistrationResponse.From(registration));
        }

        if (!walk!.IsOpen(timeProvider.GetUtcNow()))
        {
            return RegistrationRules.NotOpen();
        }

        if (registration.Status != RegistrationStatus.Pending)
        {
            return NotActive();
        }

        // The allowed sizes may have changed since the request.
        var dog = await db.Dogs.AsNoTracking().SingleOrDefaultAsync(d => d.Id == registration.DogId, cancellationToken);
        if (dog is null || !walk.AllowedSizes.Contains(dog.Size))
        {
            return RegistrationRules.SizeNotAllowed();
        }

        if (await db.CountAcceptedAsync(walk.Id, cancellationToken) >= walk.MaxDogs)
        {
            return RegistrationRules.Full();
        }

        registration.Status = RegistrationStatus.Accepted;
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        // Lot 3 notifies the author of the registration here (spec §4.4).
        return TypedResults.Ok(RegistrationResponse.From(registration));
    }

    private static async Task<Results<Ok<RegistrationResponse>, ProblemHttpResult>> DeclineRegistration(
        Guid id, Guid registrationId, ClaimsPrincipal principal, DogoDbContext db, TimeProvider timeProvider, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var (walk, registration, problem) = await LockForDecisionAsync(db, id, registrationId, principal.GetUserId(), cancellationToken);
        if (registration is null)
        {
            return problem!;
        }

        if (registration.Status == RegistrationStatus.Declined)
        {
            return TypedResults.Ok(RegistrationResponse.From(registration));
        }

        if (walk!.HasStarted(timeProvider.GetUtcNow()))
        {
            return RegistrationRules.NotOpen();
        }

        if (!registration.IsActive)
        {
            return NotActive();
        }

        // Declining a pending request or removing an accepted participant (spec §4.3).
        registration.Status = RegistrationStatus.Declined;
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        // Lot 3 notifies the author of the registration here (spec §4.4).
        return TypedResults.Ok(RegistrationResponse.From(registration));
    }

    /// <summary>
    /// Locks the walk and loads one of its registrations for a decision by the organizer:
    /// 404 when either does not exist, 403 <c>walk.forbidden</c> for anyone but the organizer.
    /// </summary>
    private static async Task<(Walk? Walk, Registration? Registration, ProblemHttpResult? Problem)> LockForDecisionAsync(
        DogoDbContext db, Guid walkId, Guid registrationId, Guid userId, CancellationToken cancellationToken)
    {
        var (walk, problem) = await WalkEndpoints.LockOrganizedWalkAsync(db, walkId, userId, cancellationToken);
        if (walk is null)
        {
            return (null, null, problem);
        }

        var registration = await db.Registrations.SingleOrDefaultAsync(r => r.Id == registrationId && r.WalkId == walkId, cancellationToken);
        return registration is null ? (walk, null, RegistrationNotFound()) : (walk, registration, null);
    }

    private static ProblemHttpResult RegistrationNotFound() =>
        Problems.NotFound(ErrorCodes.RegistrationNotFound, "The registration does not exist on this walk.");

    private static ProblemHttpResult NotActive() =>
        Problems.Conflict(ErrorCodes.RegistrationNotActive, "The registration is no longer pending or accepted.");
}
