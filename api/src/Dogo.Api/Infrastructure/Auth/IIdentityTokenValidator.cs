using Dogo.Api.Features.Users;

namespace Dogo.Api.Infrastructure.Auth;

/// <summary>Identity asserted by a valid Apple or Google ID token.</summary>
/// <param name="Subject">Stable user id at the provider (<c>sub</c>).</param>
/// <param name="Email">E-mail, only when present and verified by the provider.</param>
/// <param name="Name">Full name when the provider includes it (Google does, Apple does not).</param>
public sealed record ExternalIdentity(string Subject, string? Email, string? Name);

/// <summary>
/// Validates provider ID tokens (signature against the provider's JWKS, issuer, audience,
/// expiry). Faked in tests so that no test depends on the network.
/// </summary>
public interface IIdentityTokenValidator
{
    /// <summary>Returns the identity, or null when the token is not valid.</summary>
    Task<ExternalIdentity?> ValidateAsync(IdentityProvider provider, string token, CancellationToken cancellationToken);
}
