using Dogo.Api.Common;
using Dogo.Api.Infrastructure.Auth;
using Dogo.Api.Infrastructure.Push;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Infrastructure.Hosting;

/// <summary>
/// Marker options validated on start by <see cref="StartupChecksValidator"/>: deployment
/// settings that would otherwise only fail later, silently (ADR 0031).
/// </summary>
public sealed class StartupChecksOptions;

public static class StartupChecks
{
    /// <summary>Time zone of walks and notification texts (<c>WalkSeries.DefaultTimeZone</c>).</summary>
    public const string RequiredTimeZone = Features.Walks.WalkSeries.DefaultTimeZone;

    public static IServiceCollection AddDogoStartupChecks(this IServiceCollection services)
    {
        services.AddOptions<StartupChecksOptions>().ValidateOnStart();
        if (!BuildContext.IsOpenApiGeneration)
        {
            services.AddSingleton<IValidateOptions<StartupChecksOptions>, StartupChecksValidator>();
        }

        return services;
    }

    /// <summary>
    /// The failures of a configuration, empty when it may start. Development is not checked:
    /// <c>appsettings.Development.json</c> provides local values.
    /// </summary>
    public static IReadOnlyList<string> Check(
        IHostEnvironment environment,
        string? connectionString,
        PushProvider pushProvider,
        IReadOnlyCollection<string> appleAudiences,
        IReadOnlyCollection<string> googleAudiences,
        Func<string, bool> timeZoneExists)
    {
        var failures = new List<string>();
        if (environment.IsDevelopment())
        {
            return failures;
        }

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            failures.Add("ConnectionStrings:Dogo is empty. Set it with the ConnectionStrings__Dogo environment variable.");
        }

        if (!timeZoneExists(RequiredTimeZone))
        {
            failures.Add(
                $"The time zone '{RequiredTimeZone}' is not available on this machine (install the tzdata package): " +
                "walk series and notification texts depend on it.");
        }

        if (environment.IsProduction())
        {
            if (pushProvider == PushProvider.Log)
            {
                failures.Add("Notifications:Provider is Log in Production: no notification would be sent. Set Notifications__Provider=Expo.");
            }

            if (appleAudiences.Count == 0 && googleAudiences.Count == 0)
            {
                failures.Add(
                    "Auth:Apple:Audiences and Auth:Google:Audiences are both empty in Production: every sign-in would be refused. " +
                    "Set Auth__Apple__Audiences__0 or Auth__Google__Audiences__0.");
            }
        }

        return failures;
    }

    public static bool TimeZoneExists(string id)
    {
        try
        {
            TimeZoneInfo.FindSystemTimeZoneById(id);
            return true;
        }
        catch (Exception exception) when (exception is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            return false;
        }
    }
}

internal sealed class StartupChecksValidator(
    IHostEnvironment environment,
    IConfiguration configuration,
    IOptions<PushOptions> pushOptions,
    IOptionsMonitor<IdentityProviderOptions> identityProviders) : IValidateOptions<StartupChecksOptions>
{
    public ValidateOptionsResult Validate(string? name, StartupChecksOptions options)
    {
        var failures = StartupChecks.Check(
            environment,
            configuration.GetConnectionString("Dogo"),
            pushOptions.Value.Provider,
            NonBlank(identityProviders.Get(IdentityProviderOptions.AppleSectionName).Audiences),
            NonBlank(identityProviders.Get(IdentityProviderOptions.GoogleSectionName).Audiences),
            StartupChecks.TimeZoneExists);
        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }

    private static string[] NonBlank(string[] values) => [.. values.Where(v => !string.IsNullOrWhiteSpace(v))];
}
