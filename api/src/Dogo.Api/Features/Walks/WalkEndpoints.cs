using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Dogo.Api.Common;
using Dogo.Api.Features.Dogs;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Features.Walks;

public static class WalkEndpoints
{
    public const int DefaultListLimit = 50;
    public const int MaxListLimit = 100;
    public const double DefaultRadiusKm = 10;
    public const double MaxRadiusKm = 100;

    public static IEndpointRouteBuilder MapWalkEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("").WithTags("Walks");

        group.MapPost("/walks", CreateWalk)
            .WithName("createWalk")
            .WithSummary("Create a walk organised by the signed-in user.")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden);

        group.MapGet("/walks", SearchWalks)
            .WithName("searchWalks")
            .WithSummary("Search scheduled upcoming walks around a point, soonest first, then nearest.")
            .WithRequiredQueryParameters("lat", "lng")
            .ProducesValidationProblem();

        group.MapGet("/walks/{id:guid}", GetWalk)
            .WithName("getWalk")
            .WithSummary("Get a walk with its participants, as seen by the signed-in user.")
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPatch("/walks/{id:guid}", UpdateWalk)
            .WithName("updateWalk")
            .WithSummary("Update a walk before it starts (organizer only).")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapPost("/walks/{id:guid}/cancel", CancelWalk)
            .WithName("cancelWalk")
            .WithSummary("Cancel a walk before it starts (organizer only). Idempotent.")
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapGet("/me/walks", ListMyWalks)
            .WithName("listMyWalks")
            .WithSummary("List the walks the signed-in user organises or takes part in, upcoming or past.")
            .WithRequiredQueryParameters("role")
            .ProducesValidationProblem();

        return routes;
    }

    private static async Task<Created<WalkDetailResponse>> CreateWalk(
        CreateWalkRequest request, ClaimsPrincipal principal, DogoDbContext db, CancellationToken cancellationToken)
    {
        var userId = principal.GetUserId();
        var walk = new Walk
        {
            OrganizerId = userId,
            Title = request.Title.Trim(),
            Description = request.Description?.Trim() ?? "",
            StartsAt = TruncateToMicroseconds(request.StartsAt),
            DurationMinutes = request.DurationMinutes,
            Location = Walk.CreatePoint(request.Location.Latitude, request.Location.Longitude),
            LocationLabel = request.LocationLabel.Trim(),
            MaxDogs = request.MaxDogs,
            AllowedSizes = Sorted(request.AllowedSizes),
            LeashRule = request.LeashRule,
            Rules = request.Rules?.Trim() ?? "",
            Access = request.Access,
        };
        db.Walks.Add(walk);
        await db.SaveChangesAsync(cancellationToken);

        var detail = await db.LoadDetailAsync(walk.Id, userId, cancellationToken);
        return TypedResults.Created($"/api/v1/walks/{walk.Id}", detail);
    }

    private static async Task<Results<Ok<List<WalkSearchResult>>, ProblemHttpResult>> SearchWalks(
        ClaimsPrincipal principal,
        DogoDbContext db,
        TimeProvider timeProvider,
        CancellationToken cancellationToken,
        [Range(-90d, 90d)] double? lat,
        [Range(-180d, 180d)] double? lng,
        [Range(0d, MaxRadiusKm, MinimumIsExclusive = true)] double radiusKm = DefaultRadiusKm,
        DateTimeOffset? from = null,
        DateTimeOffset? to = null,
        DogSize? size = null,
        [Range(1, MaxListLimit)] int limit = DefaultListLimit)
    {
        // Built-in validation does not enforce [Required] on query parameters.
        if (lat is null || lng is null)
        {
            var errors = new Dictionary<string, string[]>();
            if (lat is null)
            {
                errors[nameof(lat)] = ["The lat field is required."];
            }

            if (lng is null)
            {
                errors[nameof(lng)] = ["The lng field is required."];
            }

            return Problems.Validation(errors);
        }

        // Npgsql only writes UTC offsets to timestamptz.
        from = from?.ToUniversalTime();
        to = to?.ToUniversalTime();
        var now = timeProvider.GetUtcNow();
        var start = from > now ? from.Value : now;
        if (to < start)
        {
            return Problems.Validation(nameof(to), "The end of the period must be after its start.");
        }

        var point = Walk.CreatePoint(lat.Value, lng.Value);
        var radiusMeters = radiusKm * 1000;

        // Filtering and sorting run in PostGIS (ST_DWithin / ST_Distance on geography, in metres).
        var walks = db.Walks.AsNoTracking()
            .Where(w => w.Status == WalkStatus.Scheduled
                && w.StartsAt > now
                && w.StartsAt >= start
                && w.Location.IsWithinDistance(point, radiusMeters));
        if (to is { } end)
        {
            walks = walks.Where(w => w.StartsAt <= end);
        }

        if (size is { } dogSize)
        {
            walks = walks.Where(w => w.AllowedSizes.Contains(dogSize));
        }

        var results = await walks
            .OrderBy(w => w.StartsAt).ThenBy(w => w.Location.Distance(point)).ThenBy(w => w.Id)
            .Take(limit)
            .Select(w => new
            {
                Row = new WalkRow(w, w.Organizer, w.Registrations.Count(r => r.Status == RegistrationStatus.Accepted)),
                Distance = w.Location.Distance(point),
            })
            .ToListAsync(cancellationToken);

        var viewerId = principal.GetUserId();
        return TypedResults.Ok(results
            .Select(r => WalkSearchResult.From(r.Row, r.Distance, LaterLotFields.For(r.Row.Walk, viewerId)))
            .ToList());
    }

    private static async Task<Results<Ok<WalkDetailResponse>, ProblemHttpResult>> GetWalk(
        Guid id, ClaimsPrincipal principal, DogoDbContext db, CancellationToken cancellationToken)
    {
        // Cancelled and past walks stay readable by id.
        var detail = await db.LoadDetailAsync(id, principal.GetUserId(), cancellationToken);
        return detail is null ? WalkNotFound() : TypedResults.Ok(detail);
    }

    private static async Task<Results<Ok<WalkDetailResponse>, ProblemHttpResult>> UpdateWalk(
        Guid id,
        UpdateWalkRequest request,
        ClaimsPrincipal principal,
        DogoDbContext db,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var userId = principal.GetUserId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var (walk, problem) = await LockOrganizedWalkAsync(db, id, userId, cancellationToken);
        if (walk is null)
        {
            return problem!;
        }

        if (!walk.IsOpen(timeProvider.GetUtcNow()))
        {
            return RegistrationRules.NotOpen();
        }

        if (request.MaxDogs is { } maxDogs && maxDogs < walk.MaxDogs
            && maxDogs < await db.CountAcceptedAsync(walk.Id, cancellationToken))
        {
            return Problems.Conflict(ErrorCodes.WalkCapacityBelowRegistered, "The capacity cannot be lower than the number of accepted dogs.");
        }

        if (request.AllowedSizes is { } allowedSizes)
        {
            var sizeInUse = await db.Registrations.AnyAsync(
                r => r.WalkId == walk.Id && r.Status == RegistrationStatus.Accepted && !allowedSizes.Contains(r.Dog!.Size),
                cancellationToken);
            if (sizeInUse)
            {
                return Problems.Conflict(ErrorCodes.WalkSizeInUse, "An accepted dog has a size that would no longer be allowed.");
            }

            walk.AllowedSizes = Sorted(allowedSizes);
        }

        if (request.MaxDogs is { } newMaxDogs)
        {
            walk.MaxDogs = newMaxDogs;
        }

        if (request.Title is not null)
        {
            walk.Title = request.Title.Trim();
        }

        if (request.Description is not null)
        {
            walk.Description = request.Description.Trim();
        }

        if (request.StartsAt is { } startsAt)
        {
            walk.StartsAt = TruncateToMicroseconds(startsAt);
        }

        if (request.DurationMinutes is { } durationMinutes)
        {
            walk.DurationMinutes = durationMinutes;
        }

        if (request.Location is { } location)
        {
            walk.Location = Walk.CreatePoint(location.Latitude, location.Longitude);
        }

        if (request.LocationLabel is not null)
        {
            walk.LocationLabel = request.LocationLabel.Trim();
        }

        if (request.LeashRule is { } leashRule)
        {
            walk.LeashRule = leashRule;
        }

        if (request.Rules is not null)
        {
            walk.Rules = request.Rules.Trim();
        }

        if (request.Access is { } access)
        {
            walk.Access = access;
        }

        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return TypedResults.Ok((await db.LoadDetailAsync(walk.Id, userId, cancellationToken))!);
    }

    private static async Task<Results<Ok<WalkDetailResponse>, ProblemHttpResult>> CancelWalk(
        Guid id, ClaimsPrincipal principal, DogoDbContext db, TimeProvider timeProvider, CancellationToken cancellationToken)
    {
        var userId = principal.GetUserId();
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var (walk, problem) = await LockOrganizedWalkAsync(db, id, userId, cancellationToken);
        if (walk is null)
        {
            return problem!;
        }

        if (walk.Status != WalkStatus.Cancelled)
        {
            if (walk.HasStarted(timeProvider.GetUtcNow()))
            {
                return RegistrationRules.NotOpen();
            }

            // Registrations are left as they are. Lot 3 notifies Accepted and Pending registrants here (spec §4.4).
            walk.Status = WalkStatus.Cancelled;
            await db.SaveChangesAsync(cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
        return TypedResults.Ok((await db.LoadDetailAsync(walk.Id, userId, cancellationToken))!);
    }

    private static async Task<Results<Ok<List<MyWalkResponse>>, ProblemHttpResult>> ListMyWalks(
        ClaimsPrincipal principal,
        DogoDbContext db,
        TimeProvider timeProvider,
        CancellationToken cancellationToken,
        MyWalksRole? role,
        MyWalksPeriod when = MyWalksPeriod.Upcoming,
        [Range(1, MaxListLimit)] int limit = DefaultListLimit)
    {
        // Built-in validation does not enforce [Required] on query parameters.
        if (role is null)
        {
            return Problems.Validation(nameof(role), "The role field is required.");
        }

        var userId = principal.GetUserId();
        var now = timeProvider.GetUtcNow();

        // Cancelled walks are included: the app shows them as cancelled.
        var walks = role == MyWalksRole.Organizer
            ? db.Walks.AsNoTracking().Where(w => w.OrganizerId == userId)
            : db.Walks.AsNoTracking().Where(w => w.Registrations.Any(r => r.UserId == userId
                && (r.Status == RegistrationStatus.Pending || r.Status == RegistrationStatus.Accepted)));
        walks = when == MyWalksPeriod.Upcoming
            ? walks.Where(w => w.StartsAt > now).OrderBy(w => w.StartsAt).ThenBy(w => w.Id)
            : walks.Where(w => w.StartsAt <= now).OrderByDescending(w => w.StartsAt).ThenBy(w => w.Id);

        var rows = await walks.Take(limit).ToRows().ToListAsync(cancellationToken);

        var walkIds = rows.Select(r => r.Walk.Id).ToList();
        var myRegistrations = (await db.Registrations.AsNoTracking()
                .Where(r => r.UserId == userId && walkIds.Contains(r.WalkId))
                .OrderBy(r => r.CreatedAt).ThenBy(r => r.Id)
                .ToListAsync(cancellationToken))
            .ToLookup(r => r.WalkId, MyRegistrationResponse.From);

        return TypedResults.Ok(rows
            .Select(r => MyWalkResponse.From(r, LaterLotFields.For(r.Walk, userId), myRegistrations[r.Walk.Id].ToList()))
            .ToList());
    }

    /// <summary>
    /// Locks a walk for modification by the signed-in user: 404 <c>walk.not_found</c> when it
    /// does not exist, 403 <c>walk.forbidden</c> when someone else organises it (spec §4.2).
    /// </summary>
    internal static async Task<(Walk? Walk, ProblemHttpResult? Problem)> LockOrganizedWalkAsync(
        DogoDbContext db, Guid id, Guid userId, CancellationToken cancellationToken)
    {
        var walk = await db.LockWalkAsync(id, cancellationToken);
        if (walk is null)
        {
            return (null, WalkNotFound());
        }

        return walk.OrganizerId == userId
            ? (walk, null)
            : (null, Problems.Forbidden(ErrorCodes.WalkForbidden, "Only the organizer can manage this walk."));
    }

    internal static ProblemHttpResult WalkNotFound() => Problems.NotFound(ErrorCodes.WalkNotFound, "The walk does not exist.");

    /// <summary>PostgreSQL keeps microseconds: the value returned after a write equals the one read back later.</summary>
    private static DateTimeOffset TruncateToMicroseconds(DateTimeOffset value) =>
        value.AddTicks(-(value.Ticks % TimeSpan.TicksPerMicrosecond)).ToUniversalTime();

    private static List<DogSize> Sorted(IEnumerable<DogSize> sizes) => sizes.Distinct().Order().ToList();
}
