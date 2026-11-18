using System.Reflection;

namespace Dogo.Api.Common;

public static class BuildContext
{
    /// <summary>
    /// True when the app is launched by Microsoft.Extensions.ApiDescription.Server to write
    /// <c>api/openapi.json</c> at build time. Startup checks that need real configuration
    /// (signing key, database) are skipped in that case.
    /// </summary>
    public static bool IsOpenApiGeneration { get; } =
        Assembly.GetEntryAssembly()?.GetName().Name == "GetDocument.Insider";
}
