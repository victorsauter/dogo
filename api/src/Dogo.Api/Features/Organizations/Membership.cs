using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Dogo.Api.Features.Organizations;

public enum MembershipRole
{
    Owner,
    Educator,
    Member,
}

public enum MembershipStatus
{
    Pending,
    Accepted,
    Declined,
}

/// <summary>
/// A user's place in an organisation (spec §4.6): a join request (<c>Pending</c>), a member
/// (<c>Accepted</c>) or a declined request kept as history. Leaving or being removed deletes the row.
/// </summary>
public sealed class Membership : IHasCreatedAt
{
    /// <summary>Name of the partial unique index allowing one pending or accepted membership per user and organisation.</summary>
    public const string ActiveUserIndexName = "ix_memberships_organization_id_user_id_active";

    public Guid Id { get; init; } = Guid.CreateVersion7();

    public Guid OrganizationId { get; init; }

    public Organization Organization { get; init; } = null!;

    public Guid UserId { get; init; }

    public User User { get; init; } = null!;

    public MembershipRole Role { get; set; } = MembershipRole.Member;

    public MembershipStatus Status { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>Owners and educators manage requests and create professional walks.</summary>
    public bool IsManager => Status == MembershipStatus.Accepted && Role is MembershipRole.Owner or MembershipRole.Educator;
}

internal sealed class MembershipConfiguration : IEntityTypeConfiguration<Membership>
{
    public void Configure(EntityTypeBuilder<Membership> builder)
    {
        builder.Ignore(m => m.IsManager);

        // Database guarantee against two active memberships (or requests) of the same user.
        builder.HasIndex(m => new { m.OrganizationId, m.UserId })
            .IsUnique()
            .HasFilter("status IN ('Pending', 'Accepted')")
            .HasDatabaseName(Membership.ActiveUserIndexName);
        builder.HasIndex(m => new { m.OrganizationId, m.Status });
        builder.HasIndex(m => m.UserId);

        builder.HasOne(m => m.Organization).WithMany(o => o.Memberships).HasForeignKey(m => m.OrganizationId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(m => m.User).WithMany().HasForeignKey(m => m.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
