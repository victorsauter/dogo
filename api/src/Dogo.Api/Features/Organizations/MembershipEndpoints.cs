using System.Security.Claims;
using Dogo.Api.Common;
using Dogo.Api.Features.Notifications;
using Dogo.Api.Features.Walks;
using Dogo.Api.Infrastructure.Auth;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;

namespace Dogo.Api.Features.Organizations;

public static class MembershipEndpoints
{
    public static IEndpointRouteBuilder MapMembershipEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/organizations/{id:guid}/memberships")
            .WithTags("Memberships")
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPost("", RequestMembership)
            .WithName("requestMembership")
            .WithSummary("Ask to join an approved organisation; the owner and educators decide.")
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapGet("", ListMemberships)
            .WithName("listMemberships")
            .WithSummary("List the accepted members and the pending requests of an organisation (owner and educators only).")
            .ProducesProblem(StatusCodes.Status403Forbidden);

        group.MapPost("/{membershipId:guid}/accept", AcceptMembership)
            .WithName("acceptMembership")
            .WithSummary("Accept a join request (owner or educator). Idempotent.")
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapPost("/{membershipId:guid}/decline", DeclineMembership)
            .WithName("declineMembership")
            .WithSummary("Decline a join request (owner or educator). Idempotent.")
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapPatch("/{membershipId:guid}", UpdateMembershipRole)
            .WithName("updateMembershipRole")
            .WithSummary("Change an accepted member's role between Member and Educator (owner only).")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapDelete("/{membershipId:guid}", DeleteMembership)
            .WithName("deleteMembership")
            .WithSummary("Leave an organisation or withdraw a request (own membership), or remove a member (owner or educator; only the owner removes an educator). The sole owner cannot leave. The upcoming registrations of that user to the organisation's walks are cancelled.")
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status409Conflict);

        return routes;
    }

    private static async Task<Results<Created<MembershipResponse>, ProblemHttpResult>> RequestMembership(
        Guid id,
        ClaimsPrincipal principal,
        DogoDbContext db,
        IOptions<AdminOptions> admin,
        NotificationQueue notifications,
        CancellationToken cancellationToken)
    {
        var userId = principal.GetUserId();
        var (access, problem) = await db.FindVisibleAsync(admin.Value, id, userId, cancellationToken);
        if (access is null)
        {
            return problem!;
        }

        if (access.Organization.Status != OrganizationStatus.Approved)
        {
            return Problems.Conflict(ErrorCodes.OrganizationNotApproved, "Only an approved organisation can be joined.");
        }

        if (access.Mine is { Status: MembershipStatus.Pending or MembershipStatus.Accepted })
        {
            return Duplicate();
        }

        var membership = new Membership { OrganizationId = id, UserId = userId, Role = MembershipRole.Member, Status = MembershipStatus.Pending };
        db.Memberships.Add(membership);
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: Membership.ActiveUserIndexName })
        {
            // A concurrent request of the same user won.
            return Duplicate();
        }

        await db.Entry(membership).Reference(m => m.User).LoadAsync(cancellationToken);

        // Spec §4.4: the owner and educators are told.
        notifications.Enqueue(new NotificationRequest(
            NotificationType.MembershipRequested,
            NotificationSubject.ForOrganization(access.Organization),
            userId,
            await db.ManagerIdsAsync(id, cancellationToken)));
        return TypedResults.Created((string?)null, MembershipResponse.From(membership));
    }

    private static async Task<Results<Ok<OrganizationMembersResponse>, ProblemHttpResult>> ListMemberships(
        Guid id, ClaimsPrincipal principal, DogoDbContext db, IOptions<AdminOptions> admin, CancellationToken cancellationToken)
    {
        var (access, problem) = await db.FindVisibleAsync(admin.Value, id, principal.GetUserId(), cancellationToken);
        if (access is null)
        {
            return problem!;
        }

        // Spec §4.6: the member list is visible to the owner and educators only.
        if (!access.IsManager)
        {
            return OrganizationQueries.Forbidden("Only the owner and educators can see the members.");
        }

        var memberships = await db.Memberships.AsNoTracking()
            .Where(m => m.OrganizationId == id && (m.Status == MembershipStatus.Accepted || m.Status == MembershipStatus.Pending))
            .OrderBy(m => m.Role == MembershipRole.Owner ? 0 : m.Role == MembershipRole.Educator ? 1 : 2)
            .ThenBy(m => m.User.DisplayName).ThenBy(m => m.Id)
            .Include(m => m.User)
            .ToListAsync(cancellationToken);
        var members = memberships.Where(m => m.Status == MembershipStatus.Accepted).Select(MembershipResponse.From).ToList();
        var requests = memberships
            .Where(m => m.Status == MembershipStatus.Pending)
            .OrderBy(m => m.CreatedAt).ThenBy(m => m.Id)
            .Select(MembershipResponse.From)
            .ToList();
        return TypedResults.Ok(new OrganizationMembersResponse(members, requests));
    }

    private static async Task<Results<Ok<MembershipResponse>, ProblemHttpResult>> AcceptMembership(
        Guid id,
        Guid membershipId,
        ClaimsPrincipal principal,
        DogoDbContext db,
        IOptions<AdminOptions> admin,
        NotificationQueue notifications,
        CancellationToken cancellationToken)
    {
        var userId = principal.GetUserId();
        var (access, membership, problem) = await FindForDecisionAsync(db, admin.Value, id, membershipId, userId, cancellationToken);
        if (membership is null)
        {
            return problem!;
        }

        if (membership.Status == MembershipStatus.Accepted)
        {
            return TypedResults.Ok(MembershipResponse.From(membership));
        }

        if (membership.Status != MembershipStatus.Pending)
        {
            return NotPending();
        }

        // Conditional write: the request may have been withdrawn, removed or declined meanwhile.
        if (await TransitionAsync(db, membershipId, MembershipStatus.Accepted, cancellationToken) == 0)
        {
            return await AfterLostRaceAsync(db, membership, MembershipStatus.Accepted, cancellationToken);
        }

        membership.Status = MembershipStatus.Accepted;

        // Spec §4.4: the new member is told.
        notifications.Enqueue(new NotificationRequest(
            NotificationType.MembershipAccepted, NotificationSubject.ForOrganization(access!.Organization), userId, [membership.UserId]));
        return TypedResults.Ok(MembershipResponse.From(membership));
    }

    private static async Task<Results<Ok<MembershipResponse>, ProblemHttpResult>> DeclineMembership(
        Guid id,
        Guid membershipId,
        ClaimsPrincipal principal,
        DogoDbContext db,
        IOptions<AdminOptions> admin,
        CancellationToken cancellationToken)
    {
        var (_, membership, problem) = await FindForDecisionAsync(db, admin.Value, id, membershipId, principal.GetUserId(), cancellationToken);
        if (membership is null)
        {
            return problem!;
        }

        if (membership.Status == MembershipStatus.Declined)
        {
            return TypedResults.Ok(MembershipResponse.From(membership));
        }

        // An accepted member is removed with DELETE, not declined.
        if (membership.Status != MembershipStatus.Pending)
        {
            return NotPending();
        }

        // The requester is not notified of a refusal (spec §4.4 lists acceptance only).
        if (await TransitionAsync(db, membershipId, MembershipStatus.Declined, cancellationToken) == 0)
        {
            return await AfterLostRaceAsync(db, membership, MembershipStatus.Declined, cancellationToken);
        }

        membership.Status = MembershipStatus.Declined;
        return TypedResults.Ok(MembershipResponse.From(membership));
    }

    private static async Task<Results<Ok<MembershipResponse>, ProblemHttpResult>> UpdateMembershipRole(
        Guid id,
        Guid membershipId,
        UpdateMembershipRequest request,
        ClaimsPrincipal principal,
        DogoDbContext db,
        IOptions<AdminOptions> admin,
        CancellationToken cancellationToken)
    {
        if (request.Role == MembershipRole.Owner)
        {
            return Problems.Validation("role", "The role must be Member or Educator.");
        }

        var (access, membership, problem) = await FindMembershipAsync(db, admin.Value, id, membershipId, principal.GetUserId(), cancellationToken);
        if (membership is null)
        {
            return problem!;
        }

        if (!access!.IsOwner)
        {
            return OrganizationQueries.Forbidden("Only the owner can change roles.");
        }

        if (access.Organization.Status == OrganizationStatus.Closed)
        {
            return OrganizationQueries.Closed();
        }

        if (membership.Role == MembershipRole.Owner)
        {
            return Problems.Conflict(ErrorCodes.MembershipOwnerRole, "The owner's role cannot change.");
        }

        if (membership.Status != MembershipStatus.Accepted)
        {
            return Problems.Conflict(ErrorCodes.MembershipNotAccepted, "Only an accepted member can be given a role.");
        }

        membership.Role = request.Role;
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            // The member left or was removed meanwhile.
            return MembershipNotFound();
        }

        return TypedResults.Ok(MembershipResponse.From(membership));
    }

    private static async Task<Results<NoContent, ProblemHttpResult>> DeleteMembership(
        Guid id,
        Guid membershipId,
        ClaimsPrincipal principal,
        DogoDbContext db,
        IOptions<AdminOptions> admin,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var userId = principal.GetUserId();

        // Leaving, or withdrawing one's own request, works whatever the organisation's status.
        var membership = await db.Memberships
            .SingleOrDefaultAsync(m => m.Id == membershipId && m.OrganizationId == id && m.UserId == userId, cancellationToken);
        if (membership is not null)
        {
            // Someone must stay in charge.
            if (membership is { Role: MembershipRole.Owner, Status: MembershipStatus.Accepted }
                && !await db.Memberships.AnyAsync(
                    m => m.OrganizationId == id && m.Id != membership.Id && m.Role == MembershipRole.Owner && m.Status == MembershipStatus.Accepted,
                    cancellationToken))
            {
                return Problems.Conflict(ErrorCodes.MembershipSoleOwner, "The only owner cannot leave the organisation.");
            }
        }
        else
        {
            var (access, other, problem) = await FindMembershipAsync(db, admin.Value, id, membershipId, userId, cancellationToken);
            if (other is null)
            {
                return problem!;
            }

            // An owner or educator removes a member; only the owner removes an educator.
            var allowed = other.Role switch
            {
                MembershipRole.Member => access!.IsManager,
                MembershipRole.Educator => access!.IsOwner,
                _ => false,
            };
            if (!allowed)
            {
                return OrganizationQueries.Forbidden("You cannot remove this member.");
            }

            membership = other;
        }

        // The membership row is deleted first: a registration of this user running at the same time
        // holds it share-locked, so the deletion waits for it and the update below then sees it.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var membershipToDelete = membership.Id;
        if (await db.Memberships.Where(m => m.Id == membershipToDelete).ExecuteDeleteAsync(cancellationToken) == 0)
        {
            // Removed by someone else meanwhile.
            return MembershipNotFound();
        }

        // Upcoming registrations to the walks reserved to the members of this organisation are
        // cancelled, which frees their places. The walks this user organises are left alone: an
        // organizer registers their own dogs freely (spec §4.3, §4.6).
        var now = timeProvider.GetUtcNow();
        var leaverId = membership.UserId;
        await db.Registrations
            .Where(r => r.UserId == leaverId
                && (r.Status == RegistrationStatus.Pending || r.Status == RegistrationStatus.Accepted)
                && r.Walk.OrganizationId == id
                && r.Walk.OrganizerId != leaverId
                && r.Walk.StartsAt > now)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, RegistrationStatus.Cancelled), cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    /// <summary>
    /// Loads a membership of a visible organisation: 404 <c>organization.not_found</c> or
    /// <c>membership.not_found</c>. The membership's user is loaded for the response.
    /// </summary>
    private static async Task<(OrganizationAccess? Access, Membership? Membership, ProblemHttpResult? Problem)> FindMembershipAsync(
        DogoDbContext db, AdminOptions admin, Guid organizationId, Guid membershipId, Guid userId, CancellationToken cancellationToken)
    {
        var (access, problem) = await db.FindVisibleAsync(admin, organizationId, userId, cancellationToken);
        if (access is null)
        {
            return (null, null, problem);
        }

        var membership = await db.Memberships.Include(m => m.User)
            .SingleOrDefaultAsync(m => m.Id == membershipId && m.OrganizationId == organizationId, cancellationToken);
        return membership is null ? (access, null, MembershipNotFound()) : (access, membership, null);
    }

    /// <summary>A membership to accept or decline: 403 <c>organization.forbidden</c> unless owner or educator, 409 if closed.</summary>
    private static async Task<(OrganizationAccess? Access, Membership? Membership, ProblemHttpResult? Problem)> FindForDecisionAsync(
        DogoDbContext db, AdminOptions admin, Guid organizationId, Guid membershipId, Guid userId, CancellationToken cancellationToken)
    {
        var (access, membership, problem) = await FindMembershipAsync(db, admin, organizationId, membershipId, userId, cancellationToken);
        if (membership is null)
        {
            return (access, null, problem);
        }

        if (!access!.IsManager)
        {
            return (access, null, OrganizationQueries.Forbidden("Only the owner and educators can decide on requests."));
        }

        return access.Organization.Status == OrganizationStatus.Closed
            ? (access, null, OrganizationQueries.Closed())
            : (access, membership, null);
    }

    /// <summary>
    /// Moves a pending membership to <paramref name="target"/> in one conditional <c>UPDATE</c>;
    /// returns the number of rows changed (0 when it is gone or no longer pending).
    /// </summary>
    private static Task<int> TransitionAsync(DogoDbContext db, Guid membershipId, MembershipStatus target, CancellationToken cancellationToken) =>
        db.Memberships
            .Where(m => m.Id == membershipId && m.Status == MembershipStatus.Pending)
            .ExecuteUpdateAsync(s => s.SetProperty(m => m.Status, target), cancellationToken);

    /// <summary>
    /// Answer after a concurrent change won: 404 if the membership was deleted, the same answer as
    /// an idempotent retry if it already has <paramref name="target"/>, 409 <c>membership.not_pending</c> otherwise.
    /// </summary>
    private static async Task<Results<Ok<MembershipResponse>, ProblemHttpResult>> AfterLostRaceAsync(
        DogoDbContext db, Membership membership, MembershipStatus target, CancellationToken cancellationToken)
    {
        var membershipId = membership.Id;
        var current = await db.Memberships.AsNoTracking()
            .Where(m => m.Id == membershipId)
            .Select(m => (MembershipStatus?)m.Status)
            .SingleOrDefaultAsync(cancellationToken);
        if (current is null)
        {
            return MembershipNotFound();
        }

        if (current != target)
        {
            return NotPending();
        }

        membership.Status = target;
        return TypedResults.Ok(MembershipResponse.From(membership));
    }

    private static ProblemHttpResult MembershipNotFound() =>
        Problems.NotFound(ErrorCodes.MembershipNotFound, "The membership does not exist in this organisation.");

    private static ProblemHttpResult Duplicate() =>
        Problems.Conflict(ErrorCodes.MembershipDuplicate, "You are already a member of this organisation or your request is pending.");

    private static ProblemHttpResult NotPending() =>
        Problems.Conflict(ErrorCodes.MembershipNotPending, "The request is no longer pending.");
}
