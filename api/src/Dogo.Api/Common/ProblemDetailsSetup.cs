using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Common;

/// <summary>
/// Makes every error response an RFC 9457 problem with a <c>code</c> extension:
/// explicit problems keep their code, framework-generated ones (validation, 401, 404,
/// unhandled exceptions...) get a default code derived from their status.
/// </summary>
public static partial class ProblemDetailsSetup
{
    public static IServiceCollection AddDogoProblemDetails(this IServiceCollection services)
    {
        services.AddProblemDetails(options => options.CustomizeProblemDetails = context =>
        {
            var problem = context.ProblemDetails;
            problem.Extensions.Remove("exception");
            if (problem is HttpValidationProblemDetails validation)
            {
                CamelCaseErrorKeys(validation);
            }

            if (!problem.Extensions.ContainsKey("code"))
            {
                problem.Extensions["code"] = problem is HttpValidationProblemDetails
                    ? ErrorCodes.ValidationFailed
                    : DefaultCode(problem.Status ?? context.HttpContext.Response.StatusCode);
            }
        });

        // Malformed bodies and form-size violations surface as BadHttpRequestException,
        // which BadRequestExceptionHandler turns into problems.
        services.Configure<RouteHandlerOptions>(options => options.ThrowOnBadRequest = true);
        services.AddExceptionHandler<BadRequestExceptionHandler>();
        return services;
    }

    /// <summary>Validation errors are keyed by the JSON (camelCase) name of the field, e.g. "birthDate".</summary>
    private static void CamelCaseErrorKeys(HttpValidationProblemDetails problem)
    {
        var errors = problem.Errors.ToList();
        problem.Errors.Clear();
        foreach (var (key, messages) in errors)
        {
            var name = string.Join('.', key.Split('.').Select(JsonNamingPolicy.CamelCase.ConvertName));
            problem.Errors[name] = problem.Errors.TryGetValue(name, out var existing) ? [.. existing, .. messages] : messages;
        }
    }

    private static string DefaultCode(int status) => status switch
    {
        StatusCodes.Status400BadRequest => ErrorCodes.InvalidRequest,
        StatusCodes.Status401Unauthorized => ErrorCodes.Unauthenticated,
        StatusCodes.Status403Forbidden => ErrorCodes.Forbidden,
        StatusCodes.Status404NotFound => ErrorCodes.NotFound,
        StatusCodes.Status405MethodNotAllowed => ErrorCodes.MethodNotAllowed,
        StatusCodes.Status413PayloadTooLarge => ErrorCodes.RequestTooLarge,
        StatusCodes.Status415UnsupportedMediaType => ErrorCodes.UnsupportedMediaType,
        StatusCodes.Status429TooManyRequests => ErrorCodes.RateLimitExceeded,
        >= 500 => ErrorCodes.ServerError,
        _ => ErrorCodes.Error,
    };

    /// <summary>
    /// Converts request-binding failures into problems. A JSON body that cannot be read
    /// (bad enum value, wrong type, missing required property) becomes a
    /// <c>validation.failed</c> problem naming the field when it can be determined.
    /// </summary>
    private sealed partial class BadRequestExceptionHandler(
        IProblemDetailsService problemDetailsService,
        IOptions<JsonOptions> jsonOptions) : IExceptionHandler
    {
        public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
        {
            if (exception is not BadHttpRequestException badRequest)
            {
                return false;
            }

            httpContext.Response.StatusCode = badRequest.StatusCode;
            var problem = badRequest.InnerException is JsonException json
                ? new HttpValidationProblemDetails(JsonErrors(json, jsonOptions.Value.SerializerOptions)) { Status = StatusCodes.Status400BadRequest }
                : new Microsoft.AspNetCore.Mvc.ProblemDetails { Status = badRequest.StatusCode, Title = "The request is invalid." };

            return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
            {
                HttpContext = httpContext,
                ProblemDetails = problem,
                Exception = exception,
            });
        }

        private static Dictionary<string, string[]> JsonErrors(JsonException exception, JsonSerializerOptions options)
        {
            var missing = MissingPropertiesRegex().Match(exception.Message);
            if (missing.Success)
            {
                return QuotedNameRegex().Matches(missing.Groups[1].Value)
                    .Select(m => options.PropertyNamingPolicy?.ConvertName(m.Groups[1].Value) ?? m.Groups[1].Value)
                    .Distinct()
                    .ToDictionary(name => name, _ => new[] { "The field is required." });
            }

            var path = exception.Path is null or "$" ? "body" : exception.Path.TrimStart('$', '.');
            return new Dictionary<string, string[]> { [path] = ["The value is not valid."] };
        }

        [GeneratedRegex("missing required properties including: (.*)$", RegexOptions.Singleline)]
        private static partial Regex MissingPropertiesRegex();

        [GeneratedRegex("'([^']+)'")]
        private static partial Regex QuotedNameRegex();
    }
}
