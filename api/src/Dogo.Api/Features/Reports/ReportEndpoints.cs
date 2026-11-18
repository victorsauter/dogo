using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using Dogo.Api.Common;
using Dogo.Api.Features.Walks;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Features.Reports;

/// <summary>A report: at least one of <c>targetUserId</c>, <c>targetDogId</c> and <c>walkId</c>.</summary>
public sealed record CreateReportRequest
{
    public required ReportType Type { get; init; }

    /// <summary>What happened: 10 to 4000 characters once leading and trailing white space is removed.</summary>
    [Required]
    [TrimmedLength(Report.FactsMinLength, Report.FactsMaxLength)]
    public required string Facts { get; init; }

    /// <summary>The person reported; not yourself.</summary>
    public Guid? TargetUserId { get; init; }

    public Guid? TargetDogId { get; init; }

    public Guid? WalkId { get; init; }
}

/// <summary>Acknowledges a report. Its content is never readable again outside administration.</summary>
public sealed record ReportReceiptResponse(Guid Id, DateTimeOffset CreatedAt);

public static partial class ReportEndpoints
{
    public static IEndpointRouteBuilder MapReportEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("").WithTags("Reports");

        group.MapPost("/reports", CreateReport)
            .WithName("createReport")
            .WithSummary("Report a person, a dog or a walk to the administrators. Only administrators can read reports.")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);

        return routes;
    }

    private static async Task<Results<Created<ReportReceiptResponse>, ProblemHttpResult>> CreateReport(
        CreateReportRequest request,
        ClaimsPrincipal principal,
        DogoDbContext db,
        IReportNotifier notifier,
        ILoggerFactory loggerFactory,
        CancellationToken cancellationToken)
    {
        var userId = principal.GetUserId();
        if (request.TargetUserId is null && request.TargetDogId is null && request.WalkId is null)
        {
            return Problems.Validation("target", "Give at least one of targetUserId, targetDogId and walkId.");
        }

        if (request.TargetUserId == userId)
        {
            return Problems.BadRequest(ErrorCodes.ReportSelf, "You cannot report yourself.");
        }

        if (request.TargetUserId is { } targetUserId && !await db.Users.AnyAsync(u => u.Id == targetUserId, cancellationToken))
        {
            return Problems.NotFound(ErrorCodes.UserNotFound, "The user does not exist.");
        }

        if (request.TargetDogId is { } targetDogId && !await db.Dogs.AnyAsync(d => d.Id == targetDogId, cancellationToken))
        {
            return Problems.NotFound(ErrorCodes.DogNotFound, "The dog does not exist.");
        }

        if (request.WalkId is { } walkId && !await db.Walks.AnyAsync(w => w.Id == walkId, cancellationToken))
        {
            return WalkEndpoints.WalkNotFound();
        }

        var report = new Report
        {
            ReporterId = userId,
            TargetUserId = request.TargetUserId,
            TargetDogId = request.TargetDogId,
            WalkId = request.WalkId,
            Type = request.Type,
            Facts = request.Facts.Trim(),
        };
        db.Reports.Add(report);
        await db.SaveChangesAsync(cancellationToken);

        // The report is saved: telling the administration must not fail the request.
        try
        {
            await notifier.ReportCreatedAsync(report, cancellationToken);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            LogNotifyFailed(loggerFactory.CreateLogger(typeof(ReportEndpoints)), e, report.Id);
        }

        return TypedResults.Created((string?)null, new ReportReceiptResponse(report.Id, report.CreatedAt));
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Telling the administration about report {ReportId} failed")]
    private static partial void LogNotifyFailed(ILogger logger, Exception exception, Guid reportId);
}
