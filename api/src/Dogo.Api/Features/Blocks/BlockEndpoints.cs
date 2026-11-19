using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Dogo.Api.Common;
using Dogo.Api.Features.Users;
using Dogo.Api.Features.Walks;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Features.Blocks;

public sealed record CreateBlockRequest
{
    /// <summary>The user to block.</summary>
    public required Guid UserId { get; init; }
}

/// <summary>Someone the signed-in user blocked, and since when.</summary>
public sealed record BlockResponse(UserSummaryResponse User, DateTimeOffset CreatedAt);

/// <summary>
/// Blocks (spec §4.7). Only the blocker ever sees a block: no endpoint lets the blocked person
/// find out, and registering to the blocker's walks fails exactly like registering to a full walk
/// (<c>walk.full</c>, ADR 0037).
/// </summary>
public static class BlockEndpoints
{
    public const int DefaultListLimit = 50;
    public const int MaxListLimit = 100;

    public static IEndpointRouteBuilder MapBlockEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("").WithTags("Blocks");

        group.MapPost("/blocks", BlockUser)
            .WithName("blockUser")
            .WithSummary("Block a user: they can no longer register to the signed-in user's walks, and are not told. Idempotent.")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapGet("/me/blocks", ListMyBlocks)
            .WithName("listMyBlocks")
            .WithSummary("List the users the signed-in user blocked, most recent first.")
            .ProducesValidationProblem();

        group.MapDelete("/blocks/{userId:guid}", UnblockUser)
            .WithName("unblockUser")
            .WithSummary("Unblock a user. Idempotent.")
            .ProducesProblem(StatusCodes.Status403Forbidden);

        return routes;
    }

    private static async Task<Results<Ok<BlockResponse>, ProblemHttpResult>> BlockUser(
        CreateBlockRequest request, ClaimsPrincipal principal, DogoDbContext db, TimeProvider timeProvider, CancellationToken cancellationToken)
    {
        var userId = principal.GetUserId();
        if (request.UserId == userId)
        {
            return Problems.BadRequest(ErrorCodes.BlockSelf, "You cannot block yourself.");
        }

        var blocked = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.Id == request.UserId, cancellationToken);
        if (blocked is null)
        {
            return Problems.NotFound(ErrorCodes.UserNotFound, "The user does not exist.");
        }

        // One statement, safe when the same block is sent twice at once.
        var now = WalkEndpoints.TruncateToMicroseconds(timeProvider.GetUtcNow());
        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO blocks (id, blocker_id, blocked_id, created_at)
            VALUES ({Guid.CreateVersion7()}, {userId}, {blocked.Id}, {now})
            ON CONFLICT (blocker_id, blocked_id) DO NOTHING
            """,
            cancellationToken);
        var createdAt = await db.Blocks
            .Where(b => b.BlockerId == userId && b.BlockedId == blocked.Id)
            .Select(b => b.CreatedAt)
            .SingleAsync(cancellationToken);
        return TypedResults.Ok(new BlockResponse(UserSummaryResponse.From(blocked), createdAt));
    }

    private static async Task<Ok<List<BlockResponse>>> ListMyBlocks(
        ClaimsPrincipal principal,
        DogoDbContext db,
        CancellationToken cancellationToken,
        [Range(1, MaxListLimit)] int limit = DefaultListLimit)
    {
        var userId = principal.GetUserId();
        var blocks = await db.Blocks.AsNoTracking()
            .Where(b => b.BlockerId == userId)
            .OrderByDescending(b => b.CreatedAt).ThenByDescending(b => b.Id)
            .Take(limit)
            .Include(b => b.Blocked)
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(blocks.Select(b => new BlockResponse(UserSummaryResponse.From(b.Blocked), b.CreatedAt)).ToList());
    }

    private static async Task<NoContent> UnblockUser(
        Guid userId, ClaimsPrincipal principal, DogoDbContext db, CancellationToken cancellationToken)
    {
        // Unknown or not blocked: nothing to do.
        var blockerId = principal.GetUserId();
        await db.Blocks.Where(b => b.BlockerId == blockerId && b.BlockedId == userId).ExecuteDeleteAsync(cancellationToken);
        return TypedResults.NoContent();
    }
}
