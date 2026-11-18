using Dogo.Api.Common;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;

namespace Dogo.Api.Features.Health;

public sealed record HealthResponse(string Status);

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder routes)
    {
        routes.MapGet("/health", GetHealth)
            .WithTags("Health")
            .WithName("getHealth")
            .WithSummary("Service status, including the database connection.")
            .AllowAnonymous()
            .ProducesProblem(StatusCodes.Status503ServiceUnavailable);
        return routes;
    }

    private static async Task<Results<Ok<HealthResponse>, ProblemHttpResult>> GetHealth(
        DogoDbContext db, CancellationToken cancellationToken) =>
        await db.Database.CanConnectAsync(cancellationToken)
            ? TypedResults.Ok(new HealthResponse("Healthy"))
            : Problems.Create(StatusCodes.Status503ServiceUnavailable, ErrorCodes.DatabaseUnavailable, "The database is unavailable.");
}
