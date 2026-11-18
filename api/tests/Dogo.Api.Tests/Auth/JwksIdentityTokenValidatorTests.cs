using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Auth;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Tokens;

namespace Dogo.Api.Tests.Auth;

/// <summary>
/// Unit tests of the real Apple/Google token validation, offline: the provider keys are
/// served by an in-memory document retriever.
/// </summary>
public sealed class JwksIdentityTokenValidatorTests : IDisposable
{
    private const string AppleAudience = "com.victorsauter.dogo";
    private const string GoogleAudience = "google-client-id.apps.googleusercontent.com";

    private readonly RSA _rsa = RSA.Create(2048);
    private readonly RSA _otherRsa = RSA.Create(2048);
    private readonly RsaSecurityKey _key;
    private readonly RsaSecurityKey _otherKey;
    private readonly JwksIdentityTokenValidator _validator;

    public JwksIdentityTokenValidatorTests()
    {
        _key = new RsaSecurityKey(_rsa) { KeyId = "key-1" };
        _otherKey = new RsaSecurityKey(_otherRsa) { KeyId = "key-2" };
        _validator = CreateValidator(AppleAudience, GoogleAudience);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Valid_apple_token_yields_the_identity()
    {
        var token = CreateToken("https://appleid.apple.com", AppleAudience, claims: [new("email", "a@privaterelay.appleid.com"), new("email_verified", "true")]);

        var identity = await _validator.ValidateAsync(IdentityProvider.Apple, token, Ct);

        Assert.NotNull(identity);
        Assert.Equal("subject-1", identity.Subject);
        Assert.Equal("a@privaterelay.appleid.com", identity.Email);
    }

    [Theory]
    [InlineData("https://accounts.google.com")]
    [InlineData("accounts.google.com")]
    public async Task Valid_google_token_yields_the_identity_with_its_name(string issuer)
    {
        var token = CreateToken(issuer, GoogleAudience, claims:
        [
            new("email", "bob@gmail.com"),
            new("email_verified", "true", ClaimValueTypes.Boolean),
            new("name", "Bob Durand"),
        ]);

        var identity = await _validator.ValidateAsync(IdentityProvider.Google, token, Ct);

        Assert.NotNull(identity);
        Assert.Equal("bob@gmail.com", identity.Email);
        Assert.Equal("Bob Durand", identity.Name);
    }

    [Fact]
    public async Task Unverified_email_is_ignored()
    {
        var token = CreateToken("https://accounts.google.com", GoogleAudience, claims: [new("email", "bob@example.com"), new("email_verified", "false")]);

        var identity = await _validator.ValidateAsync(IdentityProvider.Google, token, Ct);

        Assert.NotNull(identity);
        Assert.Null(identity.Email);
    }

    [Fact]
    public async Task Wrong_audience_is_rejected() =>
        Assert.Null(await _validator.ValidateAsync(IdentityProvider.Apple, CreateToken("https://appleid.apple.com", "other.app"), Ct));

    [Fact]
    public async Task Wrong_issuer_is_rejected() =>
        Assert.Null(await _validator.ValidateAsync(IdentityProvider.Apple, CreateToken("https://accounts.google.com", AppleAudience), Ct));

    [Fact]
    public async Task Token_of_the_other_provider_is_rejected() =>
        Assert.Null(await _validator.ValidateAsync(IdentityProvider.Google, CreateToken("https://appleid.apple.com", AppleAudience), Ct));

    [Fact]
    public async Task Expired_token_is_rejected() =>
        Assert.Null(await _validator.ValidateAsync(IdentityProvider.Apple, CreateToken("https://appleid.apple.com", AppleAudience, expires: DateTime.UtcNow.AddMinutes(-5)), Ct));

    [Fact]
    public async Task Token_signed_with_an_unpublished_key_is_rejected() =>
        Assert.Null(await _validator.ValidateAsync(IdentityProvider.Apple, CreateToken("https://appleid.apple.com", AppleAudience, signingKey: _otherKey), Ct));

    [Fact]
    public async Task Token_signed_with_the_published_key_but_another_algorithm_is_rejected() =>
        Assert.Null(await _validator.ValidateAsync(
            IdentityProvider.Apple, CreateToken("https://appleid.apple.com", AppleAudience, algorithm: SecurityAlgorithms.RsaSsaPssSha256), Ct));

    [Fact]
    public async Task Garbage_is_rejected() =>
        Assert.Null(await _validator.ValidateAsync(IdentityProvider.Apple, "not-a-token", Ct));

    [Fact]
    public async Task Tokens_are_rejected_when_no_audience_is_configured()
    {
        var validator = CreateValidator(appleAudience: null, googleAudience: null);

        Assert.Null(await validator.ValidateAsync(IdentityProvider.Apple, CreateToken("https://appleid.apple.com", AppleAudience), Ct));
    }

    [Fact]
    public async Task Dev_provider_is_not_validated_by_this_validator() =>
        Assert.Null(await _validator.ValidateAsync(IdentityProvider.Dev, CreateToken("https://appleid.apple.com", AppleAudience), Ct));

    public void Dispose()
    {
        _rsa.Dispose();
        _otherRsa.Dispose();
    }

    private JwksIdentityTokenValidator CreateValidator(string? appleAudience, string? googleAudience)
    {
        var options = new StaticOptionsMonitor(new Dictionary<string, IdentityProviderOptions>
        {
            [IdentityProviderOptions.AppleSectionName] = new() { Audiences = appleAudience is null ? [] : [appleAudience] },
            [IdentityProviderOptions.GoogleSectionName] = new() { Audiences = googleAudience is null ? [] : [googleAudience] },
        });
        return new JwksIdentityTokenValidator(
            new InMemoryDocumentRetriever(Jwks(_rsa, _key.KeyId)),
            options,
            NullLogger<JwksIdentityTokenValidator>.Instance,
            "https://keys.test/apple",
            "https://keys.test/google");
    }

    private string CreateToken(
        string issuer, string audience, DateTime? expires = null, RsaSecurityKey? signingKey = null, Claim[]? claims = null, string algorithm = SecurityAlgorithms.RsaSha256)
    {
        var expiry = expires ?? DateTime.UtcNow.AddMinutes(10);
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = issuer,
            Audience = audience,
            Subject = new ClaimsIdentity([new Claim("sub", "subject-1"), .. claims ?? []]),
            IssuedAt = expiry.AddMinutes(-20),
            NotBefore = expiry.AddMinutes(-20),
            Expires = expiry,
            SigningCredentials = new SigningCredentials(signingKey ?? _key, algorithm),
        });
    }

    private static string Jwks(RSA rsa, string keyId)
    {
        var parameters = rsa.ExportParameters(includePrivateParameters: false);
        return JsonSerializer.Serialize(new
        {
            keys = new[]
            {
                new
                {
                    kty = "RSA",
                    use = "sig",
                    alg = "RS256",
                    kid = keyId,
                    n = Base64UrlEncoder.Encode(parameters.Modulus),
                    e = Base64UrlEncoder.Encode(parameters.Exponent),
                },
            },
        });
    }

    private sealed class InMemoryDocumentRetriever(string document) : IDocumentRetriever
    {
        public Task<string> GetDocumentAsync(string address, CancellationToken cancel) => Task.FromResult(document);
    }

    private sealed class StaticOptionsMonitor(Dictionary<string, IdentityProviderOptions> values) : IOptionsMonitor<IdentityProviderOptions>
    {
        public IdentityProviderOptions CurrentValue => throw new NotSupportedException();

        public IdentityProviderOptions Get(string? name) => values[name!];

        public IDisposable? OnChange(Action<IdentityProviderOptions, string?> listener) => null;
    }
}
