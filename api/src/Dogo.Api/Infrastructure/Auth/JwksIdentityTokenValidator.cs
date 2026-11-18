using System.Security.Claims;
using Dogo.Api.Features.Users;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Tokens;

namespace Dogo.Api.Infrastructure.Auth;

/// <summary>
/// Validates Apple and Google ID tokens against the keys published by each provider.
/// Keys are cached and refreshed by <see cref="ConfigurationManager{T}"/>, and refreshed
/// on demand when a token is signed with an unknown key.
/// </summary>
public sealed class JwksIdentityTokenValidator : IIdentityTokenValidator
{
    public const string AppleKeysUrl = "https://appleid.apple.com/auth/keys";
    public const string GoogleKeysUrl = "https://www.googleapis.com/oauth2/v3/certs";

    private static readonly string[] AppleIssuers = ["https://appleid.apple.com"];
    private static readonly string[] GoogleIssuers = ["https://accounts.google.com", "accounts.google.com"];

    private readonly JsonWebTokenHandler _handler = new();
    private readonly Dictionary<IdentityProvider, ProviderSettings> _providers;
    private readonly ILogger<JwksIdentityTokenValidator> _logger;

    public JwksIdentityTokenValidator(
        IHttpClientFactory httpClientFactory,
        IOptionsMonitor<IdentityProviderOptions> options,
        ILogger<JwksIdentityTokenValidator> logger)
        : this(new HttpDocumentRetriever(httpClientFactory.CreateClient(nameof(JwksIdentityTokenValidator))), options, logger)
    {
    }

    internal JwksIdentityTokenValidator(
        IDocumentRetriever documentRetriever,
        IOptionsMonitor<IdentityProviderOptions> options,
        ILogger<JwksIdentityTokenValidator> logger,
        string appleKeysUrl = AppleKeysUrl,
        string googleKeysUrl = GoogleKeysUrl)
    {
        _logger = logger;
        _providers = new()
        {
            [IdentityProvider.Apple] = new(
                AppleIssuers,
                () => options.Get(IdentityProviderOptions.AppleSectionName).Audiences,
                new ConfigurationManager<JsonWebKeySet>(appleKeysUrl, new JwksRetriever(), documentRetriever)),
            [IdentityProvider.Google] = new(
                GoogleIssuers,
                () => options.Get(IdentityProviderOptions.GoogleSectionName).Audiences,
                new ConfigurationManager<JsonWebKeySet>(googleKeysUrl, new JwksRetriever(), documentRetriever)),
        };
    }

    public async Task<ExternalIdentity?> ValidateAsync(IdentityProvider provider, string token, CancellationToken cancellationToken)
    {
        if (!_providers.TryGetValue(provider, out var settings))
        {
            return null;
        }

        var audiences = settings.Audiences();
        if (audiences.Length == 0)
        {
            _logger.LogWarning("No audience configured for {Provider}; its identity tokens are rejected.", provider);
            return null;
        }

        var result = await ValidateWithKeysAsync(settings, audiences, token, cancellationToken);
        if (result.Exception is SecurityTokenSignatureKeyNotFoundException)
        {
            // The provider may have rotated its keys since they were cached.
            settings.Keys.RequestRefresh();
            result = await ValidateWithKeysAsync(settings, audiences, token, cancellationToken);
        }

        if (!result.IsValid)
        {
            _logger.LogInformation(result.Exception, "Rejected {Provider} identity token.", provider);
            return null;
        }

        var identity = result.ClaimsIdentity;
        var subject = identity.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        if (string.IsNullOrEmpty(subject))
        {
            return null;
        }

        var email = identity.FindFirst(JwtRegisteredClaimNames.Email)?.Value;
        var emailVerified = IsTrue(identity.FindFirst("email_verified"));
        return new ExternalIdentity(subject, emailVerified ? email : null, identity.FindFirst(JwtRegisteredClaimNames.Name)?.Value);
    }

    private async Task<TokenValidationResult> ValidateWithKeysAsync(
        ProviderSettings settings, string[] audiences, string token, CancellationToken cancellationToken)
    {
        JsonWebKeySet keys;
        try
        {
            keys = await settings.Keys.GetConfigurationAsync(cancellationToken);
        }
        catch (InvalidOperationException exception)
        {
            return new TokenValidationResult { IsValid = false, Exception = exception };
        }

        return await _handler.ValidateTokenAsync(token, new TokenValidationParameters
        {
            ValidIssuers = settings.Issuers,
            ValidAudiences = audiences,
            IssuerSigningKeys = keys.GetSigningKeys(),
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            RequireExpirationTime = true,
            ClockSkew = TimeSpan.FromMinutes(1),
        });
    }

    // Apple sends email_verified as a string, Google as a boolean.
    private static bool IsTrue(Claim? claim) =>
        claim is not null && bool.TryParse(claim.Value, out var value) && value;

    private sealed record ProviderSettings(string[] Issuers, Func<string[]> Audiences, ConfigurationManager<JsonWebKeySet> Keys);

    private sealed class JwksRetriever : IConfigurationRetriever<JsonWebKeySet>
    {
        public async Task<JsonWebKeySet> GetConfigurationAsync(string address, IDocumentRetriever retriever, CancellationToken cancel) =>
            new(await retriever.GetDocumentAsync(address, cancel));
    }
}
