using Microsoft.AspNetCore.Http.HttpResults;

namespace Dogo.Api.Common;

/// <summary>
/// Factory for RFC 9457 problem responses with a stable <c>code</c> extension.
/// Handlers return these instead of building <see cref="ProblemHttpResult"/> by hand.
/// Titles are developer-facing English; the mobile app translates by <c>code</c>.
/// </summary>
public static class Problems
{
    public static ProblemHttpResult Create(int status, string code, string title, string? detail = null) =>
        TypedResults.Problem(
            statusCode: status,
            title: title,
            detail: detail,
            extensions: new Dictionary<string, object?> { ["code"] = code });

    public static ProblemHttpResult NotFound(string code, string title) =>
        Create(StatusCodes.Status404NotFound, code, title);

    public static ProblemHttpResult Forbidden(string code, string title) =>
        Create(StatusCodes.Status403Forbidden, code, title);

    public static ProblemHttpResult Unauthorized(string code, string title) =>
        Create(StatusCodes.Status401Unauthorized, code, title);

    public static ProblemHttpResult BadRequest(string code, string title, string? detail = null) =>
        Create(StatusCodes.Status400BadRequest, code, title, detail);

    public static ProblemHttpResult AccountSuspended() =>
        Forbidden(ErrorCodes.AccountSuspended, "The account is suspended.");

    /// <summary>A 400 <c>validation.failed</c> problem listing the faulty fields (camelCase keys).</summary>
    public static ProblemHttpResult Validation(string field, string message) =>
        TypedResults.Problem(new HttpValidationProblemDetails(new Dictionary<string, string[]> { [field] = [message] })
        {
            Status = StatusCodes.Status400BadRequest,
            Title = "One or more validation errors occurred.",
            Extensions = { ["code"] = ErrorCodes.ValidationFailed },
        });
}
