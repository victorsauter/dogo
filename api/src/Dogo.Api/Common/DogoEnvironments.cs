namespace Dogo.Api.Common;

/// <summary>
/// Environments where development tools (dev sign-in, demo data, dev accounts as administrators)
/// are allowed: an allow list, so that any other name (Staging, Preview, a typo...) is treated like
/// Production (ADR 0031).
/// </summary>
public static class DogoEnvironments
{
    /// <summary>Environment of the automated tests (<c>DogoApiFactory</c>).</summary>
    public const string Testing = "Testing";

    /// <summary>Names allowed to run development tools, compared without case like <see cref="HostEnvironmentEnvExtensions.IsEnvironment"/>.</summary>
    public static IReadOnlyList<string> DevToolEnvironments { get; } = [Environments.Development, Testing];

    public static bool AllowsDevTools(this IHostEnvironment environment) =>
        DevToolEnvironments.Any(environment.IsEnvironment);
}
