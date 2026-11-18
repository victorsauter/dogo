using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Dogo.Api.Features.Auth;

/// <summary>
/// Opaque refresh token, stored as a SHA-256 hash. Rotated on every use: the used token is
/// revoked (and marked <see cref="ReplacedAt"/>) and a new one issued in the same
/// <see cref="FamilyId"/>. Presenting a replaced token again within the grace period issues
/// another token of the family; any other reuse revokes the whole family (ADR 0035).
/// </summary>
public sealed class RefreshToken : IHasCreatedAt
{
    public Guid Id { get; init; } = Guid.CreateVersion7();

    public Guid UserId { get; init; }

    public User User { get; init; } = null!;

    /// <summary>
    /// The chain of rotations started by one sign-in: the id of its first token, shared by
    /// every token rotated from it. Reuse outside the grace period revokes this family only.
    /// </summary>
    public Guid FamilyId { get; init; }

    /// <summary>Lowercase hex SHA-256 of the token value.</summary>
    public required string TokenHash { get; init; }

    public DateTimeOffset ExpiresAt { get; init; }

    public DateTimeOffset? RevokedAt { get; set; }

    /// <summary>
    /// When the token was rotated (<see cref="RevokedAt"/> then has the same value). Null for a
    /// token revoked otherwise: logout, suspension, family revoked after a reuse.
    /// </summary>
    public DateTimeOffset? ReplacedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.Property(t => t.TokenHash).HasMaxLength(64);
        builder.HasIndex(t => t.TokenHash).IsUnique();
        builder.HasIndex(t => t.UserId);
        builder.HasIndex(t => t.FamilyId);
        builder.HasIndex(t => t.ExpiresAt);
        builder.HasOne(t => t.User).WithMany().HasForeignKey(t => t.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
