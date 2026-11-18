using Dogo.Api.Common;
using Dogo.Api.Infrastructure.Auth;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Features.DemoData;

public sealed class DemoDataOptions
{
    public const string SectionName = "DemoData";

    /// <summary>
    /// Enables <c>/dev/demo-data</c>. Only allowed in Development and Testing (<see cref="DogoEnvironments"/>), and requires
    /// <c>Auth:AllowDevLogin</c> since demo accounts sign in through the dev sign-in.
    /// </summary>
    public bool Enabled { get; set; }

    public DemoPhotoOptions Photos { get; set; } = new();
}

/// <summary>Downloading the demo photos (avatars and breed photos, see <see cref="DemoPhotoFetcher"/>).</summary>
public sealed class DemoPhotoOptions
{
    /// <summary>
    /// Sent with every download. Generic on purpose (no personal data); Wikimedia grants higher
    /// rate limits to a user agent with a contact, which a developer may add locally.
    /// </summary>
    public string UserAgent { get; set; } = "dogo-demo-data/1.0 (development seed data)";

    /// <summary>Time allowed for each request.</summary>
    public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(10);

    /// <summary>Time allowed for all photos; the ones not fetched by then are skipped.</summary>
    public TimeSpan TotalTimeout { get; set; } = TimeSpan.FromSeconds(60);

    public int MaxParallelDownloads { get; set; } = 4;

    /// <summary>Minimum delay between two avatar requests: DiceBear limits PNG avatars to 10 per second.</summary>
    public TimeSpan AvatarInterval { get; set; } = TimeSpan.FromMilliseconds(150);
}

/// <summary>Startup checks: demo data is a development tool, refused outside the allowed environments (ADR 0031).</summary>
internal sealed class DemoDataOptionsValidator(IHostEnvironment environment, IOptions<AuthOptions> authOptions) : IValidateOptions<DemoDataOptions>
{
    public ValidateOptionsResult Validate(string? name, DemoDataOptions options)
    {
        if (!options.Enabled)
        {
            return ValidateOptionsResult.Success;
        }

        if (!environment.AllowsDevTools())
        {
            return ValidateOptionsResult.Fail(
                $"DemoData:Enabled must not be enabled in the '{environment.EnvironmentName}' environment: " +
                $"only {string.Join(" and ", DogoEnvironments.DevToolEnvironments)} allow it.");
        }

        return authOptions.Value.AllowDevLogin
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail("DemoData:Enabled requires Auth:AllowDevLogin: demo accounts sign in through the dev sign-in.");
    }
}
