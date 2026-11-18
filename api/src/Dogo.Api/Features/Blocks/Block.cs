using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Dogo.Api.Features.Blocks;

/// <summary>
/// <see cref="BlockerId"/> blocked <see cref="BlockedId"/> (spec §4.7): the blocked person can no
/// longer register to the blocker's walks and is never told.
/// </summary>
public sealed class Block : IHasCreatedAt
{
    public Guid Id { get; init; } = Guid.CreateVersion7();

    public Guid BlockerId { get; init; }

    public Guid BlockedId { get; init; }

    public User Blocked { get; init; } = null!;

    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class BlockConfiguration : IEntityTypeConfiguration<Block>
{
    public void Configure(EntityTypeBuilder<Block> builder)
    {
        builder.HasIndex(b => new { b.BlockerId, b.BlockedId }).IsUnique();
        builder.HasIndex(b => b.BlockedId);
        builder.HasOne<User>().WithMany().HasForeignKey(b => b.BlockerId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(b => b.Blocked).WithMany().HasForeignKey(b => b.BlockedId).OnDelete(DeleteBehavior.Cascade);
    }
}
