using Dogo.Api.Features.Users;
using Dogo.Api.Features.Walks;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Dogo.Api.Features.Messages;

/// <summary>A message in a walk's thread (spec §4.4).</summary>
public sealed class Message : IHasCreatedAt
{
    public const int TextMaxLength = 1000;

    public Guid Id { get; init; } = Guid.CreateVersion7();

    public Guid WalkId { get; init; }

    public Walk Walk { get; init; } = null!;

    /// <summary>Null once the author's account has been deleted: messages are kept (spec §4.8).</summary>
    public Guid? AuthorId { get; init; }

    public User? Author { get; init; }

    public required string Text { get; init; }

    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class MessageConfiguration : IEntityTypeConfiguration<Message>
{
    public void Configure(EntityTypeBuilder<Message> builder)
    {
        builder.Property(m => m.Text).HasMaxLength(Message.TextMaxLength);

        // Thread pages are read newest first by (created_at, id).
        builder.HasIndex(m => new { m.WalkId, m.CreatedAt, m.Id });
        builder.HasIndex(m => m.AuthorId);

        builder.HasOne(m => m.Walk).WithMany().HasForeignKey(m => m.WalkId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(m => m.Author).WithMany().HasForeignKey(m => m.AuthorId).OnDelete(DeleteBehavior.SetNull);
    }
}
