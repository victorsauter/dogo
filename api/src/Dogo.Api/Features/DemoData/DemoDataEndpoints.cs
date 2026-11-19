using Microsoft.AspNetCore.Http.HttpResults;

namespace Dogo.Api.Features.DemoData;

/// <summary>
/// Demo data for development (ADR 0027), anonymous like <c>/auth/dev</c>. Mapped only when
/// <c>DemoData:Enabled</c> is true (and while generating openapi.json), which startup forbids in
/// Production: otherwise the routes do not exist and answer 404 like any unknown route (ADR 0031).
/// </summary>
public static class DemoDataEndpoints
{
    public static IEndpointRouteBuilder MapDemoDataEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/dev/demo-data")
            .WithTags("DemoData")
            .AllowAnonymous()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPost("", GenerateDemoData)
            .WithName("generateDemoData")
            .WithSummary("Replace the demo data with a fresh data set (development only; 404 unless DemoData:Enabled). Photo downloads never make it fail.")
            .ProducesValidationProblem();

        group.MapGet("", GetDemoData)
            .WithName("getDemoData")
            .WithSummary("Whether demo data exists, its counts and the demo accounts to sign in as (development only).");

        group.MapDelete("", DeleteDemoData)
            .WithName("deleteDemoData")
            .WithSummary("Remove the demo accounts and everything that belongs to them, photo files included (development only).");

        return routes;
    }

    private static async Task<Ok<DemoDataGenerationResponse>> GenerateDemoData(
        GenerateDemoDataRequest? request,
        DemoDataService demoData,
        CancellationToken cancellationToken)
    {
        return TypedResults.Ok(await demoData.GenerateAsync(request?.Photos ?? true, cancellationToken));
    }

    private static async Task<Ok<DemoDataStatusResponse>> GetDemoData(
        DemoDataService demoData, CancellationToken cancellationToken)
    {
        return TypedResults.Ok(await demoData.GetStatusAsync(cancellationToken));
    }

    private static async Task<NoContent> DeleteDemoData(
        DemoDataService demoData, CancellationToken cancellationToken)
    {
        await demoData.RemoveAsync(cancellationToken);
        return TypedResults.NoContent();
    }
}
