using System.Text;
using Dogo.Api.Common;
using Dogo.Api.Features.Users;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Infrastructure.Auth;

public sealed class AuthOptions
{
    public const string SectionName = "Auth";

    /// <summary>Enables <c>POST /auth/dev</c>. Only allowed in Development and Testing (<see cref="DogoEnvironments"/>).</summary>
    public bool AllowDevLogin { get; set; }
}

public sealed class JwtOptions
{
    public const string SectionName = "Auth:Jwt";
    public const int MinimumSigningKeyBytes = 32;

    /// <summary>Key committed in <c>appsettings.Development.json</c>: public, so refused outside Development.</summary>
    public const string DevelopmentSigningKey = "dev-only-signing-key-not-for-production-0123456789";

    /// <summary>HMAC-SHA256 key (at least 32 bytes). Set through the <c>Auth__Jwt__SigningKey</c> environment variable.</summary>
    public string? SigningKey { get; set; }

    public string Issuer { get; set; } = "dogo-api";

    public string Audience { get; set; } = "dogo-app";

    public TimeSpan AccessTokenLifetime { get; set; } = TimeSpan.FromMinutes(15);

    public TimeSpan RefreshTokenLifetime { get; set; } = TimeSpan.FromDays(30);
}

/// <summary>Audiences accepted in identity tokens of one provider (bundle id, OAuth client ids...).</summary>
public sealed class IdentityProviderOptions
{
    public const string AppleSectionName = "Auth:Apple";
    public const string GoogleSectionName = "Auth:Google";

    public string[] Audiences { get; set; } = [];
}

public sealed class AdminOptions
{
    public const string SectionName = "Admin";

    /// <summary>Accounts whose (verified) e-mail is listed here are administrators.</summary>
    public string[] Emails { get; set; } = [];

    /// <summary>
    /// Address told about every new report (spec §4.7). Not used yet: no e-mail provider is chosen,
    /// reports are only logged (<c>LoggingReportNotifier</c>).
    /// </summary>
    public string? ReportEmail { get; set; }

    /// <summary>
    /// Whether accounts of the dev sign-in (<see cref="IdentityProvider.Dev"/>) may be administrators.
    /// Not bound from configuration: set from the environment (Development and Testing only, ADR 0031),
    /// because the dev sign-in lets anyone claim any e-mail.
    /// </summary>
    public bool DevAccountsCanBeAdmins { get; internal set; }

    /// <summary>Whether the e-mail is listed. Prefer <see cref="IsAdmin(IdentityProvider, UserStatus, string?)"/>, which also checks the account.</summary>
    public bool IsAdmin(string? email) =>
        email is not null && Emails.Contains(email, StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// An administrator is an active account whose e-mail is listed; a dev sign-in account only
    /// where <see cref="DevAccountsCanBeAdmins"/> is set.
    /// </summary>
    public bool IsAdmin(IdentityProvider provider, UserStatus status, string? email) =>
        status == UserStatus.Active
        && (provider != IdentityProvider.Dev || DevAccountsCanBeAdmins)
        && IsAdmin(email);
}

/// <summary>Startup checks: refuses to start with an unsafe authentication configuration.</summary>
internal sealed class AuthOptionsValidator(IHostEnvironment environment) : IValidateOptions<AuthOptions>, IValidateOptions<JwtOptions>
{
    public ValidateOptionsResult Validate(string? name, AuthOptions options) =>
        options.AllowDevLogin && !environment.AllowsDevTools()
            ? ValidateOptionsResult.Fail(
                $"Auth:AllowDevLogin must not be enabled in the '{environment.EnvironmentName}' environment: " +
                $"only {string.Join(" and ", DogoEnvironments.DevToolEnvironments)} allow it.")
            : ValidateOptionsResult.Success;

    public ValidateOptionsResult Validate(string? name, JwtOptions options)
    {
        if (Encoding.UTF8.GetByteCount(options.SigningKey ?? "") < JwtOptions.MinimumSigningKeyBytes)
        {
            return ValidateOptionsResult.Fail(
                $"Auth:Jwt:SigningKey is missing or shorter than {JwtOptions.MinimumSigningKeyBytes} bytes. " +
                "Set it with the Auth__Jwt__SigningKey environment variable.");
        }

        // The development key is in the repository: anyone could forge access tokens with it.
        return options.SigningKey == JwtOptions.DevelopmentSigningKey && !environment.IsDevelopment()
            ? ValidateOptionsResult.Fail(
                "Auth:Jwt:SigningKey is the development key committed in appsettings.Development.json; " +
                "set a secret key with the Auth__Jwt__SigningKey environment variable.")
            : ValidateOptionsResult.Success;
    }
}
