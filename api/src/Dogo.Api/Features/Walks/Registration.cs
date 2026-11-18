using Dogo.Api.Features.Dogs;
using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Dogo.Api.Features.Walks;

public enum RegistrationStatus
{
    Pending,
    Accepted,
    Declined,
    Cancelled,
}

/// <summary>Registration of one dog to one walk (spec §4.3).</summary>
public sealed class Registration : IHasCreatedAt
{
    /// <summary>Name of the partial unique index enforcing one active registration per dog and walk.</summary>
    public const string ActiveDogIndexName = "ix_registrations_walk_id_dog_id_active";

    public Guid Id { get; init; } = Guid.CreateVersion7();

    public Guid WalkId { get; init; }

    public Walk Walk { get; init; } = null!;

    /// <summary>
    /// Null once the dog has been deleted: its upcoming registrations are cancelled first
    /// (spec §4.1) and past ones are kept as history.
    /// </summary>
    public Guid? DogId { get; init; }

    public Dog? Dog { get; init; }

    /// <summary>Owner of the dog when registering.</summary>
    public Guid UserId { get; init; }

    public User User { get; init; } = null!;

    public RegistrationStatus Status { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    /// <summary><c>Pending</c> and <c>Accepted</c> registrations block registering the same dog again.</summary>
    public bool IsActive => Status is RegistrationStatus.Pending or RegistrationStatus.Accepted;
}

internal sealed class RegistrationConfiguration : IEntityTypeConfiguration<Registration>
{
    public void Configure(EntityTypeBuilder<Registration> builder)
    {
        builder.Ignore(r => r.IsActive);

        // Database guarantee against two active registrations of the same dog, even under
        // concurrent requests (the walk row lock already serialises them).
        builder.HasIndex(r => new { r.WalkId, r.DogId })
            .IsUnique()
            .HasFilter("status IN ('Pending', 'Accepted')")
            .HasDatabaseName(Registration.ActiveDogIndexName);
        builder.HasIndex(r => new { r.WalkId, r.Status });
        builder.HasIndex(r => r.DogId);
        builder.HasIndex(r => r.UserId);

        builder.HasOne(r => r.Walk).WithMany(w => w.Registrations).HasForeignKey(r => r.WalkId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(r => r.Dog).WithMany().HasForeignKey(r => r.DogId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(r => r.User).WithMany().HasForeignKey(r => r.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
