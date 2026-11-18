using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Dogo.Api.Infrastructure.Auth;

/// <summary>Issues the API's own access tokens: HMAC-signed JWTs whose <c>sub</c> is the user id.</summary>
public sealed class AccessTokenIssuer(IOptions<JwtOptions> options, TimeProvider timeProvider)
{
    private readonly JsonWebTokenHandler _handler = new();

    public (string Token, DateTimeOffset ExpiresAt) Issue(Guid userId)
    {
        var jwt = options.Value;
        var now = timeProvider.GetUtcNow();
        // JWT timestamps have second precision; expose the exact value that is in the token.
        var expiresAt = DateTimeOffset.FromUnixTimeSeconds((now + jwt.AccessTokenLifetime).ToUnixTimeSeconds());
        var token = _handler.CreateToken(new SecurityTokenDescriptor
        {
            Issuer = jwt.Issuer,
            Audience = jwt.Audience,
            Subject = new ClaimsIdentity([new Claim(JwtRegisteredClaimNames.Sub, userId.ToString())]),
            IssuedAt = now.UtcDateTime,
            NotBefore = now.UtcDateTime,
            Expires = expiresAt.UtcDateTime,
            SigningCredentials = new SigningCredentials(CreateSigningKey(jwt), SecurityAlgorithms.HmacSha256),
        });
        return (token, expiresAt);
    }

    public static SymmetricSecurityKey CreateSigningKey(JwtOptions options) =>
        new(Encoding.UTF8.GetBytes(options.SigningKey ?? ""));
}
