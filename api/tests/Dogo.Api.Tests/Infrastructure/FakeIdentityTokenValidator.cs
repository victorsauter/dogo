using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Auth;

namespace Dogo.Api.Tests.Infrastructure;

/// <summary>
/// Offline stand-in for Apple/Google token validation. A token is valid when it reads
/// <c>valid|{subject}|{email}|{name}</c> (email and name may be empty); <c>throw</c> raises
/// an exception, anything else is rejected.
/// </summary>
public sealed class FakeIdentityTokenValidator : IIdentityTokenValidator
{
    public static string Token(string subject, string? email = null, string? name = null) => $"valid|{subject}|{email}|{name}";

    public Task<ExternalIdentity?> ValidateAsync(IdentityProvider provider, string token, CancellationToken cancellationToken)
    {
        if (token == "throw")
        {
            throw new InvalidOperationException("Sensitive internal failure details");
        }

        var parts = token.Split('|');
        if (parts.Length != 4 || parts[0] != "valid")
        {
            return Task.FromResult<ExternalIdentity?>(null);
        }

        return Task.FromResult<ExternalIdentity?>(new ExternalIdentity(parts[1], NullIfEmpty(parts[2]), NullIfEmpty(parts[3])));
    }

    private static string? NullIfEmpty(string value) => value.Length == 0 ? null : value;
}
