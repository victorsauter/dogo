using System.Security.Cryptography;
using System.Text;
using Dogo.Api.Common;
using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Auth;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Features.Auth;

/// <summary>Creates, refreshes and revokes sessions (access token + rotating refresh token, ADR 0009).</summary>
public sealed class SessionService(
    DogoDbContext db,
    AccessTokenIssuer accessTokens,
    IOptions<JwtOptions> jwtOptions,
    IOptions<AdminOptions> adminOptions,
    TimeProvider timeProvider,
    ILogger<SessionService> logger)
{
    /// <summary>Default display name of an account whose provider gave no name.</summary>
    public const string DefaultDisplayName = "Nouveau membre";

    /// <summary>Signs in the account of an external identity, creating it on first sign-in.</summary>
    public async Task<Results<Ok<SessionResponse>, ProblemHttpResult>> SignInAsync(
        IdentityProvider provider, string subject, string? email, string? displayName, CancellationToken cancellationToken)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Provider == provider && u.ProviderSubject == subject, cancellationToken);
        if (user is null)
        {
            user = new User
            {
                Provider = provider,
                ProviderSubject = subject,
                Email = email,
                DisplayName = NormalizeDisplayName(displayName),
            };
            db.Users.Add(user);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException)
            {
                // Two first sign-ins may have raced: the other one created the account.
                db.ChangeTracker.Clear();
                var existing = await db.Users.SingleOrDefaultAsync(u => u.Provider == provider && u.ProviderSubject == subject, cancellationToken);
                if (existing is null)
                {
                    throw;
                }

                user = existing;
            }
        }
        else if (email is not null && email != user.Email)
        {
            user.Email = email;
        }

        if (user.Status == UserStatus.Suspended)
        {
            return Problems.AccountSuspended();
        }

        return TypedResults.Ok(await CreateSessionAsync(user, cancellationToken));
    }

    /// <summary>Rotates a refresh token. Reusing a revoked token revokes every token of its user.</summary>
    public async Task<Results<Ok<SessionResponse>, ProblemHttpResult>> RefreshAsync(string refreshToken, CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var hash = Hash(refreshToken);
        var stored = await db.RefreshTokens.Include(t => t.User)
            .SingleOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);
        if (stored is null || stored.ExpiresAt <= now)
        {
            return InvalidRefreshToken();
        }

        if (stored.RevokedAt is not null)
        {
            await RevokeAllAsync(stored.UserId, now, cancellationToken);
            return InvalidRefreshToken();
        }

        if (stored.User.Status == UserStatus.Suspended)
        {
            return Problems.AccountSuspended();
        }

        // Conditional update: of two concurrent refreshes with the same token, only one wins.
        var revoked = await db.RefreshTokens
            .Where(t => t.Id == stored.Id && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), cancellationToken);
        if (revoked == 0)
        {
            await RevokeAllAsync(stored.UserId, now, cancellationToken);
            return InvalidRefreshToken();
        }

        return TypedResults.Ok(await CreateSessionAsync(stored.User, cancellationToken));
    }

    /// <summary>Revokes a refresh token. Unknown or already revoked tokens are ignored.</summary>
    public Task RevokeAsync(string refreshToken, CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var hash = Hash(refreshToken);
        return db.RefreshTokens
            .Where(t => t.TokenHash == hash && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), cancellationToken);
    }

    private async Task<SessionResponse> CreateSessionAsync(User user, CancellationToken cancellationToken)
    {
        var refreshToken = Base64Url(RandomNumberGenerator.GetBytes(32));
        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = Hash(refreshToken),
            ExpiresAt = timeProvider.GetUtcNow() + jwtOptions.Value.RefreshTokenLifetime,
        });
        await db.SaveChangesAsync(cancellationToken);

        var (accessToken, expiresAt) = accessTokens.Issue(user.Id);
        return new SessionResponse(accessToken, expiresAt, refreshToken, MeResponse.From(user, adminOptions.Value));
    }

    private async Task RevokeAllAsync(Guid userId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        logger.LogWarning("Revoked refresh token reused for user {UserId}; revoking all their sessions.", userId);
        await db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), cancellationToken);
    }

    private static ProblemHttpResult InvalidRefreshToken() =>
        Problems.Unauthorized(ErrorCodes.InvalidToken, "The refresh token is invalid, expired or revoked.");

    private static string NormalizeDisplayName(string? displayName)
    {
        var name = displayName?.Trim();
        if (string.IsNullOrEmpty(name))
        {
            return DefaultDisplayName;
        }

        return name.Length <= User.DisplayNameMaxLength ? name : name[..User.DisplayNameMaxLength].TrimEnd();
    }

    internal static string Hash(string token) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
