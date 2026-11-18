using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Dogo.Api.Common;
using Dogo.Api.Features.Notifications;
using Dogo.Api.Features.Walks;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Features.Messages;

public static class MessageEndpoints
{
    public const int DefaultPageSize = 50;
    public const int MaxPageSize = 100;

    public static IEndpointRouteBuilder MapMessageEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/walks/{id:guid}/messages").WithTags("Messages");

        group.MapGet("", ListMessages)
            .WithName("listMessages")
            .WithSummary("Read a walk's thread (organizer and owners of accepted dogs): the most recent messages, or those older than `before`, oldest first.")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPost("", PostMessage)
            .WithName("postMessage")
            .WithSummary("Write in a walk's thread (organizer and owners of accepted dogs). Refused once the walk is cancelled.")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        return routes;
    }

    private static async Task<Results<Ok<MessagePageResponse>, ProblemHttpResult>> ListMessages(
        Guid id,
        ClaimsPrincipal principal,
        DogoDbContext db,
        CancellationToken cancellationToken,
        Guid? before = null,
        [Range(1, MaxPageSize)] int limit = DefaultPageSize)
    {
        var userId = principal.GetUserId();
        var (walk, problem) = await FindThreadAsync(db, id, userId, cancellationToken);
        if (walk is null)
        {
            return problem!;
        }

        var messages = db.Messages.AsNoTracking().Where(m => m.WalkId == id);
        if (before is { } beforeId)
        {
            var cursor = await db.Messages.AsNoTracking()
                .Where(m => m.Id == beforeId && m.WalkId == id)
                .Select(m => new { m.CreatedAt, m.Id })
                .SingleOrDefaultAsync(cancellationToken);
            if (cursor is null)
            {
                return Problems.Validation(nameof(before), "The message does not exist in this thread.");
            }

            // Row value comparison: strictly older in the (created_at, id) order.
            messages = messages.Where(m => EF.Functions.LessThan(
                ValueTuple.Create(m.CreatedAt, m.Id), ValueTuple.Create(cursor.CreatedAt, cursor.Id)));
        }

        // One extra row tells whether older messages exist.
        var page = await messages
            .OrderByDescending(m => m.CreatedAt).ThenByDescending(m => m.Id)
            .Take(limit + 1)
            .Include(m => m.Author)
            .ToListAsync(cancellationToken);
        var hasMore = page.Count > limit;
        var items = page.Take(limit).Reverse().Select(m => MessageResponse.From(m, userId)).ToList();
        return TypedResults.Ok(new MessagePageResponse(items, hasMore));
    }

    private static async Task<Results<Created<MessageResponse>, ProblemHttpResult>> PostMessage(
        Guid id,
        CreateMessageRequest request,
        ClaimsPrincipal principal,
        DogoDbContext db,
        NotificationQueue notifications,
        CancellationToken cancellationToken)
    {
        var userId = principal.GetUserId();
        var (walk, problem) = await FindThreadAsync(db, id, userId, cancellationToken);
        if (walk is null)
        {
            return problem!;
        }

        // A cancelled walk's thread stays readable but is closed.
        if (walk.Status == WalkStatus.Cancelled)
        {
            return RegistrationRules.NotOpen();
        }

        var message = new Message { WalkId = id, AuthorId = userId, Text = request.Text.Trim() };
        db.Messages.Add(message);
        await db.SaveChangesAsync(cancellationToken);
        await db.Entry(message).Reference(m => m.Author).LoadAsync(cancellationToken);

        // Spec §4.4: the organizer and accepted participants, except the author (dropped by the service).
        var recipients = await AcceptedOwnerIds(db, id).ToListAsync(cancellationToken);
        recipients.AddRange(walk.OrganizerRecipients());
        notifications.Enqueue(new NotificationRequest(
            NotificationType.MessagePosted, NotificationSubject.ForWalk(walk), userId, recipients, message.Text));

        return TypedResults.Created((string?)null, MessageResponse.From(message, userId));
    }

    /// <summary>
    /// The walk whose thread <paramref name="userId"/> may read and write (spec §4.4): 404
    /// <c>walk.not_found</c>, or 403 <c>message.forbidden</c> unless they organise the walk or
    /// own a dog whose registration is accepted.
    /// </summary>
    private static async Task<(Walk? Walk, ProblemHttpResult? Problem)> FindThreadAsync(
        DogoDbContext db, Guid walkId, Guid userId, CancellationToken cancellationToken)
    {
        var walk = await db.Walks.AsNoTracking().SingleOrDefaultAsync(w => w.Id == walkId, cancellationToken);
        if (walk is null)
        {
            return (null, WalkEndpoints.WalkNotFound());
        }

        if (walk.OrganizerId == userId || await AcceptedOwnerIds(db, walkId).AnyAsync(u => u == userId, cancellationToken))
        {
            return (walk, null);
        }

        return (null, Problems.Forbidden(ErrorCodes.MessageForbidden, "Only the organizer and the owners of accepted dogs can use this thread."));
    }

    /// <summary>Owners of accepted dogs; registrations of a deleted dog do not count.</summary>
    private static IQueryable<Guid> AcceptedOwnerIds(DogoDbContext db, Guid walkId) =>
        db.Registrations
            .Where(r => r.WalkId == walkId && r.Status == RegistrationStatus.Accepted && r.DogId != null)
            .Select(r => r.UserId)
            .Distinct();
}
