using System.ComponentModel.DataAnnotations;
using Dogo.Api.Common;
using Dogo.Api.Features.Users;
using Dogo.Api.Features.Walks;

namespace Dogo.Api.Features.Organizations;

public sealed record CreateOrganizationRequest
{
    /// <summary>3 to 80 characters once leading and trailing white space is removed.</summary>
    [Required]
    [TrimmedLength(Organization.NameMinLength, Organization.NameMaxLength)]
    public required string Name { get; init; }

    [StringLength(Organization.DescriptionMaxLength)]
    public string? Description { get; init; }

    [StringLength(Organization.CityMaxLength)]
    public string? City { get; init; }
}

/// <summary>
/// Partial update of an organisation (owner only): an omitted or null property is left unchanged.
/// Send an empty string to clear <c>description</c> or <c>city</c>.
/// </summary>
public sealed record UpdateOrganizationRequest
{
    [TrimmedLength(Organization.NameMinLength, Organization.NameMaxLength)]
    public string? Name { get; init; }

    [StringLength(Organization.DescriptionMaxLength)]
    public string? Description { get; init; }

    [StringLength(Organization.CityMaxLength)]
    public string? City { get; init; }
}

/// <summary>New role of a member (owner only): <c>Member</c> or <c>Educator</c>.</summary>
public sealed record UpdateMembershipRequest
{
    public required MembershipRole Role { get; init; }
}

/// <summary>An organisation in a list. <c>memberCount</c> counts accepted members of every role.</summary>
public sealed record OrganizationSummaryResponse(
    Guid Id,
    string Name,
    string Description,
    string? City,
    OrganizationStatus Status,
    int MemberCount,
    DateTimeOffset CreatedAt);

/// <summary>The signed-in user's membership of an organisation.</summary>
public sealed record MyMembershipResponse(Guid Id, MembershipRole Role, MembershipStatus Status)
{
    internal static MyMembershipResponse From(Membership membership) => new(membership.Id, membership.Role, membership.Status);
}

/// <summary>The owner or an educator of an organisation, shown on its page.</summary>
public sealed record OrganizationEducatorResponse(UserSummaryResponse User, MembershipRole Role);

/// <summary>
/// An organisation's page (<c>GET /organizations/{id}</c>), as seen by the signed-in user.
/// <c>myMembership</c> is the user's pending or accepted membership, else their latest declined
/// request, else null. <c>upcomingWalks</c>: its next 20 scheduled walks, soonest first.
/// </summary>
public sealed record OrganizationDetailResponse(
    Guid Id,
    string Name,
    string Description,
    string? City,
    OrganizationStatus Status,
    DateTimeOffset CreatedAt,
    int MemberCount,
    IReadOnlyList<OrganizationEducatorResponse> Educators,
    MyMembershipResponse? MyMembership,
    IReadOnlyList<WalkListItemResponse> UpcomingWalks);

/// <summary>One of the signed-in user's memberships (any status) with its organisation (any status).</summary>
public sealed record MyOrganizationResponse(OrganizationSummaryResponse Organization, MyMembershipResponse Membership);

/// <summary>A member or a join request, as seen by the owner and educators.</summary>
public sealed record MembershipResponse(
    Guid Id,
    Guid OrganizationId,
    UserSummaryResponse User,
    MembershipRole Role,
    MembershipStatus Status,
    DateTimeOffset CreatedAt)
{
    /// <summary>Requires <see cref="Membership.User"/> to be loaded.</summary>
    internal static MembershipResponse From(Membership membership) => new(
        membership.Id,
        membership.OrganizationId,
        UserSummaryResponse.From(membership.User),
        membership.Role,
        membership.Status,
        membership.CreatedAt);
}

/// <summary>
/// Accepted members (owner first, then educators, then members, each by name) and pending
/// requests (oldest first). Visible to the owner and educators only (spec §4.6).
/// </summary>
public sealed record OrganizationMembersResponse(IReadOnlyList<MembershipResponse> Members, IReadOnlyList<MembershipResponse> Requests);
