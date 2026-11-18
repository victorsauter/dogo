using Dogo.Api.Common;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Features.DemoData;

/// <summary>
/// Demo data for development (ADR 0027), anonymous like <c>/auth/dev</c>. Mapped unconditionally
/// so that it appears in openapi.json, like the dev sign-in; every route answers 404 unless
/// <c>DemoData:Enabled</c> is true, which startup forbids in Production.
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

    private static async Task<Results<Ok<DemoDataGenerationResponse>, ProblemHttpResult>> GenerateDemoData(
        GenerateDemoDataRequest? request,
        IOptions<DemoDataOptions> options,
        DemoDataService demoData,
        CancellationToken cancellationToken)
    {
        if (!options.Value.Enabled)
        {
            return Disabled();
        }

        return TypedResults.Ok(await demoData.GenerateAsync(request?.Photos ?? true, cancellationToken));
    }

    private static async Task<Results<Ok<DemoDataStatusResponse>, ProblemHttpResult>> GetDemoData(
        IOptions<DemoDataOptions> options, DemoDataService demoData, CancellationToken cancellationToken)
    {
        if (!options.Value.Enabled)
        {
            return Disabled();
        }

        return TypedResults.Ok(await demoData.GetStatusAsync(cancellationToken));
    }

    private static async Task<Results<NoContent, ProblemHttpResult>> DeleteDemoData(
        IOptions<DemoDataOptions> options, DemoDataService demoData, CancellationToken cancellationToken)
    {
        if (!options.Value.Enabled)
        {
            return Disabled();
        }

        await demoData.RemoveAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    private static ProblemHttpResult Disabled() => Problems.NotFound(ErrorCodes.NotFound, "Not Found");
}
