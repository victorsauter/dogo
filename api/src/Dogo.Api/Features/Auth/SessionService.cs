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

/// <summary>
/// Creates, refreshes and revokes sessions: access token + rotating refresh token (ADR 0009),
/// grouped in families with a short reuse grace period (ADR 0035).
/// </summary>
public sealed partial class SessionService(
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

        // A sign-in starts a new family.
        return TypedResults.Ok(await CreateSessionAsync(user, familyId: null, cancellationToken));
    }

    /// <summary>
    /// Rotates a refresh token (ADR 0035). A token replaced less than the grace period ago gives
    /// another token of the same family (lost response, concurrent refreshes); any other reuse
    /// of a revoked token revokes its family, and only it.
    /// </summary>
    public async Task<Results<Ok<SessionResponse>, ProblemHttpResult>> RefreshAsync(string refreshToken, CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var hash = Hash(refreshToken);
        var stored = await db.RefreshTokens.AsNoTracking().Include(t => t.User)
            .SingleOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);
        if (stored is null || stored.ExpiresAt <= now)
        {
            return InvalidRefreshToken();
        }

        // Everything that changes a family runs under its lock: concurrent refreshes of the same
        // token are serialised, and a family revocation cannot miss a token issued meanwhile.
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await LockFamilyAsync(stored.FamilyId, cancellationToken);
        var state = await db.RefreshTokens.AsNoTracking()
            .Where(t => t.Id == stored.Id)
            .Select(t => new { t.RevokedAt, t.ReplacedAt })
            .SingleOrDefaultAsync(cancellationToken);
        if (state is null)
        {
            return InvalidRefreshToken();
        }

        if (state.RevokedAt is null)
        {
            if (stored.User.Status == UserStatus.Suspended)
            {
                return Problems.AccountSuspended();
            }

            await db.RefreshTokens
                .Where(t => t.Id == stored.Id && t.RevokedAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now).SetProperty(t => t.ReplacedAt, now), cancellationToken);
            var session = await CreateSessionAsync(stored.User, stored.FamilyId, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return TypedResults.Ok(session);
        }

        if (await IsWithinGracePeriodAsync(stored.FamilyId, state.ReplacedAt, now, cancellationToken))
        {
            if (stored.User.Status == UserStatus.Suspended)
            {
                return Problems.AccountSuspended();
            }

            // The client never got (or lost) the successor: a new token of the same family. The
            // earlier successor stays valid, so the client may keep whichever response it read.
            var session = await CreateSessionAsync(stored.User, stored.FamilyId, cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            LogGraceReuse(stored.UserId, stored.FamilyId);
            return TypedResults.Ok(session);
        }

        var revoked = await RevokeFamilyAsync(stored.FamilyId, now, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        LogReuseDetected(stored.UserId, stored.FamilyId, revoked);
        return InvalidRefreshToken();
    }

    /// <summary>
    /// Logs out: revokes the token's whole family (the session on that device), so that no
    /// token issued during a grace period survives. Unknown tokens are ignored.
    /// </summary>
    public async Task RevokeAsync(string refreshToken, CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var hash = Hash(refreshToken);
        var familyId = await db.RefreshTokens.Where(t => t.TokenHash == hash).Select(t => (Guid?)t.FamilyId).SingleOrDefaultAsync(cancellationToken);
        if (familyId is null)
        {
            return;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await LockFamilyAsync(familyId.Value, cancellationToken);
        await RevokeFamilyAsync(familyId.Value, now, cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    /// <summary>
    /// A rotated token is accepted again for <see cref="JwtOptions.RefreshTokenGracePeriod"/>,
    /// as long as its family is still alive (not logged out nor revoked).
    /// </summary>
    private async Task<bool> IsWithinGracePeriodAsync(Guid familyId, DateTimeOffset? replacedAt, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var grace = jwtOptions.Value.RefreshTokenGracePeriod;
        return grace > TimeSpan.Zero
            && replacedAt is { } at
            && now - at <= grace
            && await db.RefreshTokens.AnyAsync(t => t.FamilyId == familyId && t.RevokedAt == null && t.ExpiresAt > now, cancellationToken);
    }

    private Task<int> RevokeFamilyAsync(Guid familyId, DateTimeOffset now, CancellationToken cancellationToken) =>
        db.RefreshTokens
            .Where(t => t.FamilyId == familyId && t.RevokedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, now), cancellationToken);

    /// <summary>Transaction-scoped advisory lock on a family, released at commit or rollback.</summary>
    private Task LockFamilyAsync(Guid familyId, CancellationToken cancellationToken) =>
        db.Database.ExecuteSqlAsync($"SELECT pg_advisory_xact_lock({FamilyLockKey(familyId)})", cancellationToken);

    /// <summary>64-bit key of the family's advisory lock: the random half of the identifier.</summary>
    internal static long FamilyLockKey(Guid familyId) => BitConverter.ToInt64(familyId.ToByteArray(), 8);

    private async Task<SessionResponse> CreateSessionAsync(User user, Guid? familyId, CancellationToken cancellationToken)
    {
        var refreshToken = Base64Url(RandomNumberGenerator.GetBytes(32));
        var id = Guid.CreateVersion7();
        db.RefreshTokens.Add(new RefreshToken
        {
            Id = id,
            UserId = user.Id,
            FamilyId = familyId ?? id,
            TokenHash = Hash(refreshToken),
            ExpiresAt = timeProvider.GetUtcNow() + jwtOptions.Value.RefreshTokenLifetime,
        });
        await db.SaveChangesAsync(cancellationToken);

        var (accessToken, expiresAt) = accessTokens.Issue(user.Id);
        return new SessionResponse(accessToken, expiresAt, refreshToken, MeResponse.From(user, adminOptions.Value));
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

    [LoggerMessage(Level = LogLevel.Information, Message = "Refresh token of family {FamilyId} (user {UserId}) presented again within the grace period; new token issued")]
    private partial void LogGraceReuse(Guid userId, Guid familyId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Revoked refresh token reused for user {UserId}; family {FamilyId} revoked ({Count} live tokens)")]
    private partial void LogReuseDetected(Guid userId, Guid familyId, int count);
}
