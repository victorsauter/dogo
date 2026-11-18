using Dogo.Api.Features.Dogs;
using Dogo.Api.Features.Users;
using Dogo.Api.Features.Walks;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Dogo.Api.Features.Reports;

public enum ReportType
{
    IncidentNoInjury,
    Altercation,
    BiteOrInjury,
    HumanBehavior,
}

public enum ReportStatus
{
    Open,
    Reviewed,
    Closed,
}

/// <summary>
/// A report about a person, a dog or a walk (spec §4.7), readable by administrators only.
/// Every reference is cleared rather than the report deleted when what it points to disappears.
/// </summary>
public sealed class Report : IHasCreatedAt
{
    public const int FactsMinLength = 10;
    public const int FactsMaxLength = 4000;
    public const int AdminNoteMaxLength = 2000;

    public Guid Id { get; init; } = Guid.CreateVersion7();

    /// <summary>Null once the reporter's account has been deleted (spec §4.8).</summary>
    public Guid? ReporterId { get; init; }

    public User? Reporter { get; init; }

    public Guid? TargetUserId { get; init; }

    public User? TargetUser { get; init; }

    public Guid? TargetDogId { get; init; }

    public Dog? TargetDog { get; init; }

    public Guid? WalkId { get; init; }

    public Walk? Walk { get; init; }

    public ReportType Type { get; init; }

    public required string Facts { get; init; }

    public ReportStatus Status { get; set; } = ReportStatus.Open;

    public string? AdminNote { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}

internal sealed class ReportConfiguration : IEntityTypeConfiguration<Report>
{
    public void Configure(EntityTypeBuilder<Report> builder)
    {
        builder.Property(r => r.Facts).HasMaxLength(Report.FactsMaxLength);
        builder.Property(r => r.AdminNote).HasMaxLength(Report.AdminNoteMaxLength);
        builder.HasIndex(r => new { r.Status, r.CreatedAt });
        builder.HasIndex(r => r.ReporterId);
        builder.HasIndex(r => r.TargetUserId);
        builder.HasIndex(r => r.TargetDogId);
        builder.HasIndex(r => r.WalkId);

        builder.HasOne(r => r.Reporter).WithMany().HasForeignKey(r => r.ReporterId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(r => r.TargetUser).WithMany().HasForeignKey(r => r.TargetUserId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(r => r.TargetDog).WithMany().HasForeignKey(r => r.TargetDogId).OnDelete(DeleteBehavior.SetNull);
        builder.HasOne(r => r.Walk).WithMany().HasForeignKey(r => r.WalkId).OnDelete(DeleteBehavior.SetNull);
    }
}
