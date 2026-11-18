using System.Text;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Infrastructure.Auth;

public sealed class AuthOptions
{
    public const string SectionName = "Auth";

    /// <summary>Enables <c>POST /auth/dev</c>. Forbidden in Production.</summary>
    public bool AllowDevLogin { get; set; }
}

public sealed class JwtOptions
{
    public const string SectionName = "Auth:Jwt";
    public const int MinimumSigningKeyBytes = 32;

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

    public bool IsAdmin(string? email) =>
        email is not null && Emails.Contains(email, StringComparer.OrdinalIgnoreCase);
}

/// <summary>Startup checks: refuses to start with an unsafe authentication configuration.</summary>
internal sealed class AuthOptionsValidator(IHostEnvironment environment) : IValidateOptions<AuthOptions>, IValidateOptions<JwtOptions>
{
    public ValidateOptionsResult Validate(string? name, AuthOptions options) =>
        options.AllowDevLogin && environment.IsProduction()
            ? ValidateOptionsResult.Fail("Auth:AllowDevLogin must not be enabled in Production.")
            : ValidateOptionsResult.Success;

    public ValidateOptionsResult Validate(string? name, JwtOptions options) =>
        Encoding.UTF8.GetByteCount(options.SigningKey ?? "") < JwtOptions.MinimumSigningKeyBytes
            ? ValidateOptionsResult.Fail(
                $"Auth:Jwt:SigningKey is missing or shorter than {JwtOptions.MinimumSigningKeyBytes} bytes. " +
                "Set it with the Auth__Jwt__SigningKey environment variable.")
            : ValidateOptionsResult.Success;
}
