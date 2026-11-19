using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Dogo.Api.Features.Dogs;

public enum DogSize
{
    Small,
    Medium,
    Large,
}

public enum Sociability
{
    Easygoing,
    Selective,
    Reserved,
}

public enum Reactivity
{
    None,
    Mild,
    Strong,
}

public enum LeashHabit
{
    OnLeash,
    LongLine,
    OffLeash,
}

public sealed class Dog : IHasCreatedAt
{
    public const int NameMaxLength = 50;
    public const int BreedMaxLength = 80;
    public const int DescriptionMaxLength = 1000;

    /// <summary>
    /// How many dogs one account may have (409 <c>dog.limit_reached</c> beyond). Far above any real
    /// household; it bounds the public profile, which lists every dog of a user without paging.
    /// </summary>
    public const int MaxPerOwner = 20;

    public Guid Id { get; init; } = Guid.CreateVersion7();

    public Guid OwnerId { get; init; }

    public User Owner { get; init; } = null!;

    public required string Name { get; set; }

    /// <summary>File name in <see cref="Infrastructure.Storage.IPhotoStorage"/>; exposed as <c>photoUrl</c>.</summary>
    public string? PhotoFileName { get; set; }

    public DogSize Size { get; set; }

    public DateOnly? BirthDate { get; set; }

    public string? Breed { get; set; }

    public Sociability Sociability { get; set; }

    public Reactivity Reactivity { get; set; }

    public LeashHabit LeashHabit { get; set; }

    public string Description { get; set; } = "";

    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class DogConfiguration : IEntityTypeConfiguration<Dog>
{
    public void Configure(EntityTypeBuilder<Dog> builder)
    {
        builder.Property(d => d.Name).HasMaxLength(Dog.NameMaxLength);
        builder.Property(d => d.Breed).HasMaxLength(Dog.BreedMaxLength);
        builder.Property(d => d.Description).HasMaxLength(Dog.DescriptionMaxLength);
        builder.Property(d => d.PhotoFileName).HasMaxLength(64);
        builder.HasIndex(d => d.OwnerId);
        builder.HasOne(d => d.Owner).WithMany(u => u.Dogs).HasForeignKey(d => d.OwnerId).OnDelete(DeleteBehavior.Cascade);
    }
}
