using System.ComponentModel.DataAnnotations;
using Dogo.Api.Features.Users;

namespace Dogo.Api.Features.Auth;

public sealed record AppleSignInRequest
{
    /// <summary>Identity token returned by Sign in with Apple.</summary>
    [Required]
    public required string IdentityToken { get; init; }

    /// <summary>Name given by Apple on the first authorization only; used when creating the account.</summary>
    [StringLength(200)]
    public string? DisplayName { get; init; }
}

public sealed record GoogleSignInRequest
{
    /// <summary>ID token returned by Google Sign-In.</summary>
    [Required]
    public required string IdToken { get; init; }
}

public sealed record DevSignInRequest
{
    /// <summary>Any stable identifier of the test account (e.g. "alice").</summary>
    [Required]
    [StringLength(100, MinimumLength = 1)]
    public required string Subject { get; init; }

    [Required]
    [StringLength(User.DisplayNameMaxLength, MinimumLength = 1)]
    public required string DisplayName { get; init; }

    /// <summary>
    /// Optional e-mail of the test account, taken as verified (dev sign-in only): lets a tester act
    /// as an administrator by using an address listed in <c>Admin:Emails</c>. Omitted: unchanged.
    /// </summary>
    [EmailAddress]
    [StringLength(320)]
    public string? Email { get; init; }
}

public sealed record RefreshTokenRequest
{
    [Required]
    public required string RefreshToken { get; init; }
}

/// <summary>A session: returned by every sign-in endpoint and by <c>POST /auth/refresh</c>.</summary>
public sealed record SessionResponse(
    string AccessToken,
    DateTimeOffset AccessTokenExpiresAt,
    string RefreshToken,
    MeResponse User);
