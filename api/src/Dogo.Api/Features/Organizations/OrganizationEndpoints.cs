using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Dogo.Api.Common;
using Dogo.Api.Infrastructure.Auth;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Features.Organizations;

public static class OrganizationEndpoints
{
    public const int DefaultListLimit = 50;
    public const int MaxListLimit = 100;
    public const int QueryMaxLength = 80;

    public static IEndpointRouteBuilder MapOrganizationEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("").WithTags("Organizations");

        group.MapPost("/organizations", CreateOrganization)
            .WithName("createOrganization")
            .WithSummary("Ask for the creation of an organisation: Pending until an administrator approves it; the signed-in user becomes its owner.")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapGet("/organizations", SearchOrganizations)
            .WithName("searchOrganizations")
            .WithSummary("Search approved organisations by name or city (case-insensitive), by name.")
            .ProducesValidationProblem();

        group.MapGet("/organizations/{id:guid}", GetOrganization)
            .WithName("getOrganization")
            .WithSummary("Get an organisation with its owner and educators, member count, upcoming walks and the signed-in user's membership. Not approved: members and administrators only.")
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPatch("/organizations/{id:guid}", UpdateOrganization)
            .WithName("updateOrganization")
            .WithSummary("Update an organisation (owner only).")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict);

        group.MapGet("/me/organizations", ListMyOrganizations)
            .WithName("listMyOrganizations")
            .WithSummary("List the signed-in user's memberships in any status, with their organisation (including those awaiting approval).")
            .ProducesValidationProblem();

        return routes;
    }

    private static async Task<Results<Created<OrganizationDetailResponse>, ProblemHttpResult>> CreateOrganization(
        CreateOrganizationRequest request,
        ClaimsPrincipal principal,
        DogoDbContext db,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var userId = principal.GetUserId();

        // The user row lock serialises concurrent requests of one user, so the limit holds.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await db.Database.ExecuteSqlAsync($"SELECT 1 FROM users WHERE id = {userId} FOR UPDATE", cancellationToken);
        var pending = await db.Organizations.CountAsync(
            o => o.CreatedById == userId && o.Status == OrganizationStatus.Pending, cancellationToken);
        if (pending >= Organization.MaxPendingPerUser)
        {
            return Problems.Conflict(
                ErrorCodes.OrganizationTooManyPending,
                $"At most {Organization.MaxPendingPerUser} organisations can await approval at a time.");
        }

        var organization = new Organization
        {
            Name = request.Name.Trim(),
            Description = request.Description?.Trim() ?? "",
            City = OrganizationQueries.NullIfBlank(request.City),
            CreatedById = userId,
        };
        var owner = new Membership
        {
            OrganizationId = organization.Id,
            UserId = userId,
            Role = MembershipRole.Owner,
            Status = MembershipStatus.Accepted,
        };
        db.Organizations.Add(organization);
        db.Memberships.Add(owner);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var detail = await db.LoadDetailAsync(new OrganizationAccess(organization, owner), userId, timeProvider.GetUtcNow(), cancellationToken);
        return TypedResults.Created($"/api/v1/organizations/{organization.Id}", detail);
    }

    private static async Task<Ok<List<OrganizationSummaryResponse>>> SearchOrganizations(
        DogoDbContext db,
        CancellationToken cancellationToken,
        [StringLength(QueryMaxLength)] string? query = null,
        [Range(1, MaxListLimit)] int limit = DefaultListLimit)
    {
        // Only approved organisations are visible to other users (spec §4.6).
        var organizations = db.Organizations.AsNoTracking().Where(o => o.Status == OrganizationStatus.Approved);
        if (!string.IsNullOrWhiteSpace(query))
        {
            var pattern = $"%{EscapeLike(query.Trim())}%";
            organizations = organizations.Where(o =>
                EF.Functions.ILike(o.Name, pattern, @"\") || (o.City != null && EF.Functions.ILike(o.City, pattern, @"\")));
        }

        var results = await organizations
            .OrderBy(o => o.Name).ThenBy(o => o.Id)
            .Take(limit)
            .ToSummaries()
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(results);
    }

    private static async Task<Results<Ok<OrganizationDetailResponse>, ProblemHttpResult>> GetOrganization(
        Guid id,
        ClaimsPrincipal principal,
        DogoDbContext db,
        IOptions<AdminOptions> admin,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var userId = principal.GetUserId();
        var (access, problem) = await db.FindVisibleAsync(admin.Value, id, userId, cancellationToken);
        return access is null
            ? problem!
            : TypedResults.Ok(await db.LoadDetailAsync(access, userId, timeProvider.GetUtcNow(), cancellationToken));
    }

    private static async Task<Results<Ok<OrganizationDetailResponse>, ProblemHttpResult>> UpdateOrganization(
        Guid id,
        UpdateOrganizationRequest request,
        ClaimsPrincipal principal,
        DogoDbContext db,
        IOptions<AdminOptions> admin,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        var userId = principal.GetUserId();
        var (access, problem) = await db.FindVisibleAsync(admin.Value, id, userId, cancellationToken);
        if (access is null)
        {
            return problem!;
        }

        if (!access.IsOwner)
        {
            return OrganizationQueries.Forbidden("Only the owner can modify this organisation.");
        }

        var organization = access.Organization;
        if (organization.Status == OrganizationStatus.Closed)
        {
            return OrganizationQueries.Closed();
        }

        if (request.Name is not null)
        {
            organization.Name = request.Name.Trim();
        }

        if (request.Description is not null)
        {
            organization.Description = request.Description.Trim();
        }

        if (request.City is not null)
        {
            organization.City = OrganizationQueries.NullIfBlank(request.City);
        }

        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok(await db.LoadDetailAsync(access, userId, timeProvider.GetUtcNow(), cancellationToken));
    }

    private static async Task<Ok<List<MyOrganizationResponse>>> ListMyOrganizations(
        ClaimsPrincipal principal,
        DogoDbContext db,
        CancellationToken cancellationToken,
        [Range(1, MaxListLimit)] int limit = DefaultListLimit)
    {
        var userId = principal.GetUserId();
        var results = await db.Memberships.AsNoTracking()
            .Where(m => m.UserId == userId)
            .OrderBy(m => m.Organization.Name).ThenByDescending(m => m.CreatedAt).ThenBy(m => m.Id)
            .Take(limit)
            .Select(m => new MyOrganizationResponse(
                new OrganizationSummaryResponse(
                    m.Organization.Id,
                    m.Organization.Name,
                    m.Organization.Description,
                    m.Organization.City,
                    m.Organization.Status,
                    m.Organization.Memberships.Count(x => x.Status == MembershipStatus.Accepted),
                    m.Organization.CreatedAt),
                new MyMembershipResponse(m.Id, m.Role, m.Status)))
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(results);
    }

    /// <summary>Makes <c>%</c>, <c>_</c> and <c>\</c> match themselves in a LIKE pattern.</summary>
    private static string EscapeLike(string value) =>
        value.Replace(@"\", @"\\").Replace("%", @"\%").Replace("_", @"\_");
}
