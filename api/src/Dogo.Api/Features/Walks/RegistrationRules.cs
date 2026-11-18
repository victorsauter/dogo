using Dogo.Api.Common;
using Dogo.Api.Features.Organizations;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Features.Walks;

/// <summary>A registration request after the walk has been locked: who registers which dogs.</summary>
internal sealed record RegistrationAttempt(Walk Walk, Guid UserId, IReadOnlyList<Guid> DogIds, DateTimeOffset Now)
{
    /// <summary>The organizer's own dogs are accepted immediately, even on an <c>Approval</c> walk (spec §4.3).</summary>
    public RegistrationStatus InitialStatus =>
        Walk.Access == WalkAccess.Open || Walk.OrganizerId == UserId ? RegistrationStatus.Accepted : RegistrationStatus.Pending;
}

/// <summary>
/// The rules of spec §4.3 checked before creating registrations, in order; the first
/// failure is returned. Runs while the walk row is locked, so counts cannot change underneath.
/// </summary>
internal static class RegistrationRules
{
    public static async Task<ProblemHttpResult?> CheckAsync(
        DogoDbContext db, RegistrationAttempt attempt, CancellationToken cancellationToken)
    {
        var walk = attempt.Walk;

        if (!walk.IsOpen(attempt.Now))
        {
            return NotOpen();
        }

        // Someone else's dog is reported like a missing one (spec: 404).
        var dogs = await db.Dogs.AsNoTracking()
            .Where(d => attempt.DogIds.Contains(d.Id) && d.OwnerId == attempt.UserId)
            .ToListAsync(cancellationToken);
        if (dogs.Count != attempt.DogIds.Count)
        {
            return Problems.NotFound(ErrorCodes.DogNotFound, "A dog does not exist or does not belong to you.");
        }

        if (dogs.Any(d => !walk.AllowedSizes.Contains(d.Size)))
        {
            return SizeNotAllowed();
        }

        var alreadyRegistered = await db.Registrations.AnyAsync(
            r => r.WalkId == walk.Id
                && r.DogId != null && attempt.DogIds.Contains(r.DogId.Value)
                && (r.Status == RegistrationStatus.Pending || r.Status == RegistrationStatus.Accepted),
            cancellationToken);
        if (alreadyRegistered)
        {
            return Duplicate();
        }

        // Spec §4.7: the organizer blocked the user. The answer must not reveal the block.
        if (await db.Blocks.AnyAsync(b => b.BlockerId == walk.OrganizerId && b.BlockedId == attempt.UserId, cancellationToken))
        {
            return NotAllowed();
        }

        // Spec §4.6: a professional walk is reserved to accepted members of its organisation
        // (any role). The organizer, an owner or educator, registers their own dogs freely.
        if (walk.OrganizationId is { } organizationId
            && walk.OrganizerId != attempt.UserId
            && !await db.Memberships.AnyAsync(
                m => m.OrganizationId == organizationId && m.UserId == attempt.UserId && m.Status == MembershipStatus.Accepted,
                cancellationToken))
        {
            return Problems.Forbidden(ErrorCodes.WalkMembersOnly, "This walk is reserved to the members of its organisation.");
        }

        // Only accepted dogs take a place. A pending request does not, but it is refused when
        // the walk could not take these dogs right now; acceptance checks again.
        if (await db.CountAcceptedAsync(walk.Id, cancellationToken) + dogs.Count > walk.MaxDogs)
        {
            return Full();
        }

        return null;
    }

    public static ProblemHttpResult NotOpen() =>
        Problems.Conflict(ErrorCodes.WalkNotOpen, "The walk is cancelled or has already started.");

    public static ProblemHttpResult SizeNotAllowed() =>
        Problems.Conflict(ErrorCodes.WalkSizeNotAllowed, "The size of a dog is not allowed on this walk.");

    public static ProblemHttpResult Duplicate() =>
        Problems.Conflict(ErrorCodes.RegistrationDuplicate, "A dog is already registered to this walk.");

    /// <summary>Deliberately generic: a blocked user must not learn that they are blocked (spec §4.7).</summary>
    public static ProblemHttpResult NotAllowed() =>
        Problems.Forbidden(ErrorCodes.WalkNotAllowed, "Registration to this walk is not possible.");

    public static ProblemHttpResult Full() =>
        Problems.Conflict(ErrorCodes.WalkFull, "There are not enough places left on this walk.");
}
