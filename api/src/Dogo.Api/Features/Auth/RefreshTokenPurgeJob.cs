using Dogo.Api.Infrastructure.Auth;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Features.Auth;

/// <summary>
/// Deletes the refresh tokens expired or revoked for longer than
/// <see cref="JwtOptions.RefreshTokenRetention"/> (ADR 0035). Called periodically by
/// <see cref="Infrastructure.Jobs.BackgroundJobsService"/>; tests call it with a controlled clock.
/// </summary>
/// <remarks>
/// Deletes in batches whose rows are taken with <c>FOR UPDATE SKIP LOCKED</c>: concurrent runs
/// (several instances) share the work instead of waiting for each other, and a refresh holding
/// a row is never blocked. A revoked token is kept while it can still reveal a reuse: with the
/// default retention (the token lifetime), it has expired before being deleted.
/// </remarks>
public sealed partial class RefreshTokenPurgeJob(
    DogoDbContext db,
    TimeProvider timeProvider,
    IOptions<JwtOptions> options,
    ILogger<RefreshTokenPurgeJob> logger)
{
    public const int BatchSize = 1000;

    /// <summary>Deletes the stale tokens; returns how many were deleted.</summary>
    public async Task<int> RunAsync(CancellationToken cancellationToken)
    {
        var before = timeProvider.GetUtcNow() - options.Value.RefreshTokenRetention;
        var deleted = 0;
        int batch;
        do
        {
            batch = await db.Database.ExecuteSqlAsync(
                $"""
                DELETE FROM refresh_tokens WHERE id IN (
                    SELECT id FROM refresh_tokens
                    WHERE expires_at < {before} OR revoked_at < {before}
                    LIMIT {BatchSize}
                    FOR UPDATE SKIP LOCKED)
                """,
                cancellationToken);
            deleted += batch;
        }
        while (batch == BatchSize);

        if (deleted > 0)
        {
            LogPurged(deleted);
        }

        return deleted;
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Purged {Count} expired or revoked refresh tokens")]
    private partial void LogPurged(int count);
}
