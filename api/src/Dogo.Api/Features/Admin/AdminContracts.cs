using System.ComponentModel.DataAnnotations;
using Dogo.Api.Features.Organizations;
using Dogo.Api.Features.Reports;
using Dogo.Api.Features.Users;

namespace Dogo.Api.Features.Admin;

/// <summary>An organisation as reviewed by an administrator. <c>createdBy</c> is null once that account has been deleted.</summary>
public sealed record AdminOrganizationResponse(
    Guid Id,
    string Name,
    string Description,
    string? City,
    OrganizationStatus Status,
    UserSummaryResponse? CreatedBy,
    int MemberCount,
    DateTimeOffset CreatedAt);

/// <summary>The dog a report is about.</summary>
public sealed record ReportDogResponse(Guid Id, string Name, Guid OwnerId);

/// <summary>The walk a report is about.</summary>
public sealed record ReportWalkResponse(Guid Id, string Title, DateTimeOffset StartsAt);

/// <summary>
/// A report with who sent it and what it is about. A reference is null when it was not given or
/// no longer exists (deleted account, dog or walk).
/// </summary>
public sealed record AdminReportResponse(
    Guid Id,
    ReportType Type,
    string Facts,
    ReportStatus Status,
    string? AdminNote,
    DateTimeOffset CreatedAt,
    UserSummaryResponse? Reporter,
    UserSummaryResponse? TargetUser,
    ReportDogResponse? TargetDog,
    ReportWalkResponse? Walk)
{
    /// <summary>Requires the reporter, target user, target dog and walk to be loaded.</summary>
    internal static AdminReportResponse From(Report report) => new(
        report.Id,
        report.Type,
        report.Facts,
        report.Status,
        report.AdminNote,
        report.CreatedAt,
        report.Reporter is null ? null : UserSummaryResponse.From(report.Reporter),
        report.TargetUser is null ? null : UserSummaryResponse.From(report.TargetUser),
        report.TargetDog is null ? null : new ReportDogResponse(report.TargetDog.Id, report.TargetDog.Name, report.TargetDog.OwnerId),
        report.Walk is null ? null : new ReportWalkResponse(report.Walk.Id, report.Walk.Title, report.Walk.StartsAt));
}

/// <summary>Classifies a report: an omitted or null property is left unchanged; an empty <c>adminNote</c> clears it.</summary>
public sealed record UpdateReportRequest
{
    public ReportStatus? Status { get; init; }

    [StringLength(Report.AdminNoteMaxLength)]
    public string? AdminNote { get; init; }
}

/// <summary>A user's account status after a suspension or its lifting.</summary>
public sealed record AdminUserResponse(Guid Id, string DisplayName, UserStatus Status);
