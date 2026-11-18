using Dogo.Api.Common;
using Dogo.Api.Features.Admin;
using Dogo.Api.Features.Walks;
using Dogo.Api.Infrastructure.Auth;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Features.Organizations;

/// <summary>An organisation as seen by one user, with that user's membership.</summary>
/// <param name="Mine">The user's pending or accepted membership, else their latest declined request.</param>
internal sealed record OrganizationAccess(Organization Organization, Membership? Mine)
{
    public bool IsMember => Mine is { Status: MembershipStatus.Accepted };

    public bool IsManager => Mine is { IsManager: true };

    public bool IsOwner => Mine is { Status: MembershipStatus.Accepted, Role: MembershipRole.Owner };
}

internal static class OrganizationQueries
{
    /// <summary>How many upcoming walks the organisation page shows.</summary>
    public const int UpcomingWalksShown = 20;

    /// <summary>
    /// Loads an organisation (tracked) for <paramref name="userId"/>, applying spec §4.6: an
    /// <c>Approved</c> organisation is visible to everyone, the others only to their accepted
    /// members and to administrators; anyone else gets 404 <c>organization.not_found</c>, as if it
    /// did not exist.
    /// </summary>
    public static async Task<(OrganizationAccess? Access, ProblemHttpResult? Problem)> FindVisibleAsync(
        this DogoDbContext db, AdminOptions admin, Guid id, Guid userId, CancellationToken cancellationToken)
    {
        var organization = await db.Organizations.SingleOrDefaultAsync(o => o.Id == id, cancellationToken);
        if (organization is null)
        {
            return (null, NotFound());
        }

        var mine = await db.Memberships
            .Where(m => m.OrganizationId == id && m.UserId == userId)
            .OrderBy(m => m.Status == MembershipStatus.Declined).ThenByDescending(m => m.CreatedAt).ThenByDescending(m => m.Id)
            .FirstOrDefaultAsync(cancellationToken);
        var access = new OrganizationAccess(organization, mine);
        if (organization.Status == OrganizationStatus.Approved || access.IsMember || await db.IsAdminAsync(admin, userId, cancellationToken))
        {
            return (access, null);
        }

        return (null, NotFound());
    }

    /// <summary>Organisations as list items, with their number of accepted members, in one SQL query.</summary>
    public static IQueryable<OrganizationSummaryResponse> ToSummaries(this IQueryable<Organization> organizations) =>
        organizations.Select(o => new OrganizationSummaryResponse(
            o.Id,
            o.Name,
            o.Description,
            o.City,
            o.Status,
            o.Memberships.Count(m => m.Status == MembershipStatus.Accepted),
            o.CreatedAt));

    /// <summary>Builds the organisation page as seen by <paramref name="viewerId"/>.</summary>
    public static async Task<OrganizationDetailResponse> LoadDetailAsync(
        this DogoDbContext db, OrganizationAccess access, Guid viewerId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var organization = access.Organization;
        var memberCount = await db.Memberships.CountAsync(
            m => m.OrganizationId == organization.Id && m.Status == MembershipStatus.Accepted, cancellationToken);

        var educators = await db.Memberships.AsNoTracking()
            .Where(m => m.OrganizationId == organization.Id
                && m.Status == MembershipStatus.Accepted
                && (m.Role == MembershipRole.Owner || m.Role == MembershipRole.Educator))
            .OrderBy(m => m.Role == MembershipRole.Owner ? 0 : 1).ThenBy(m => m.User.DisplayName).ThenBy(m => m.Id)
            .Include(m => m.User)
            .ToListAsync(cancellationToken);

        var walks = await db.Walks.AsNoTracking()
            .Where(w => w.OrganizationId == organization.Id && w.Status == WalkStatus.Scheduled && w.StartsAt > now)
            .OrderBy(w => w.StartsAt).ThenBy(w => w.Id)
            .Take(UpcomingWalksShown)
            .ToRows(db, viewerId)
            .ToListAsync(cancellationToken);

        return new OrganizationDetailResponse(
            organization.Id,
            organization.Name,
            organization.Description,
            organization.City,
            organization.Status,
            organization.CreatedAt,
            memberCount,
            educators.Select(m => new OrganizationEducatorResponse(Users.UserSummaryResponse.From(m.User), m.Role)).ToList(),
            access.Mine is null ? null : MyMembershipResponse.From(access.Mine),
            walks.Select(r => WalkListItemResponse.From(r, LaterLotFields.For(r))).ToList());
    }

    /// <summary>Accepted owners and educators: told about join requests.</summary>
    public static Task<List<Guid>> ManagerIdsAsync(this DogoDbContext db, Guid organizationId, CancellationToken cancellationToken) =>
        db.Memberships
            .Where(m => m.OrganizationId == organizationId
                && m.Status == MembershipStatus.Accepted
                && (m.Role == MembershipRole.Owner || m.Role == MembershipRole.Educator))
            .Select(m => m.UserId)
            .ToListAsync(cancellationToken);

    /// <summary>Accepted owners: told when the organisation is approved.</summary>
    public static Task<List<Guid>> OwnerIdsAsync(this DogoDbContext db, Guid organizationId, CancellationToken cancellationToken) =>
        db.Memberships
            .Where(m => m.OrganizationId == organizationId && m.Status == MembershipStatus.Accepted && m.Role == MembershipRole.Owner)
            .Select(m => m.UserId)
            .ToListAsync(cancellationToken);

    public static ProblemHttpResult NotFound() =>
        Problems.NotFound(ErrorCodes.OrganizationNotFound, "The organisation does not exist.");

    public static ProblemHttpResult Forbidden(string title) =>
        Problems.Forbidden(ErrorCodes.OrganizationForbidden, title);

    public static ProblemHttpResult Closed() =>
        Problems.Conflict(ErrorCodes.OrganizationClosed, "The organisation is closed.");

    /// <summary>Normalises an optional text: trimmed, null when blank.</summary>
    public static string? NullIfBlank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
