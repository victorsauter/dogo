using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Dogo.Api.Features.Organizations;

public enum OrganizationStatus
{
    Pending,
    Approved,
    Rejected,
    Closed,
}

/// <summary>
/// A club, educator or association (spec §4.6). Created <c>Pending</c>; only an <c>Approved</c>
/// organisation is visible to everyone and can carry professional walks. <c>Closed</c> is final
/// (its only owner deleted their account, spec §4.8).
/// </summary>
public sealed class Organization : IHasCreatedAt
{
    public const int NameMinLength = 3;
    public const int NameMaxLength = 80;
    public const int DescriptionMaxLength = 2000;
    public const int CityMaxLength = 80;

    /// <summary>How many organisations awaiting approval one user may have requested at a time.</summary>
    public const int MaxPendingPerUser = 3;

    public Guid Id { get; init; } = Guid.CreateVersion7();

    public required string Name { get; set; }

    public string Description { get; set; } = "";

    /// <summary>Optional; null when not given.</summary>
    public string? City { get; set; }

    public OrganizationStatus Status { get; set; } = OrganizationStatus.Pending;

    /// <summary>Who requested the creation; null once their account has been deleted.</summary>
    public Guid? CreatedById { get; init; }

    public User? CreatedBy { get; init; }

    public DateTimeOffset CreatedAt { get; set; }

    public List<Membership> Memberships { get; } = [];
}

internal sealed class OrganizationConfiguration : IEntityTypeConfiguration<Organization>
{
    public void Configure(EntityTypeBuilder<Organization> builder)
    {
        builder.Property(o => o.Name).HasMaxLength(Organization.NameMaxLength);
        builder.Property(o => o.Description).HasMaxLength(Organization.DescriptionMaxLength);
        builder.Property(o => o.City).HasMaxLength(Organization.CityMaxLength);
        builder.HasIndex(o => o.Status);
        builder.HasIndex(o => new { o.CreatedById, o.Status });
        builder.HasOne(o => o.CreatedBy).WithMany().HasForeignKey(o => o.CreatedById).OnDelete(DeleteBehavior.SetNull);
    }
}
