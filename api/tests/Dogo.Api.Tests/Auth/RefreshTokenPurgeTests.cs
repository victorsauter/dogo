using Dogo.Api.Features.Auth;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;

namespace Dogo.Api.Tests.Auth;

/// <summary>ADR 0035: refresh tokens expired or revoked for longer than the retention (30 days) are deleted.</summary>
public sealed class RefreshTokenPurgeTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    [Fact]
    public async Task The_purge_deletes_only_tokens_expired_or_revoked_longer_ago_than_the_retention()
    {
        var now = DateTimeOffset.UtcNow;
        var expiredLongAgo = await TokenAsync("expired-long-ago", expiresAt: now.AddDays(-31));
        var revokedLongAgo = await TokenAsync("revoked-long-ago", expiresAt: now.AddDays(5), revokedAt: now.AddDays(-31));
        var expiredRecently = await TokenAsync("expired-recently", expiresAt: now.AddDays(-1));
        var revokedRecently = await TokenAsync("revoked-recently", expiresAt: now.AddDays(20), revokedAt: now.AddDays(-10));
        var live = await TokenAsync("live", expiresAt: now.AddDays(30));

        var deleted = await RunPurgeAsync(now);

        Assert.Equal(2, deleted);
        var remaining = await WithDbAsync(db => db.RefreshTokens.Select(t => t.Id).ToListAsync(Ct));
        Assert.Equivalent(new[] { expiredRecently, revokedRecently, live }, remaining);
        Assert.DoesNotContain(expiredLongAgo, remaining);
        Assert.DoesNotContain(revokedLongAgo, remaining);
    }

    [Fact]
    public async Task Concurrent_purges_delete_each_token_once()
    {
        var now = DateTimeOffset.UtcNow;
        await SignInDevAsync("keeper", "Keeper");
        var userId = await WithDbAsync(db => db.Users.Select(u => u.Id).SingleAsync(Ct));
        await WithDbAsync(async db =>
        {
            for (var i = 0; i < RefreshTokenPurgeJob.BatchSize + 500; i++)
            {
                var id = Guid.CreateVersion7();
                db.RefreshTokens.Add(new RefreshToken { Id = id, UserId = userId, FamilyId = id, TokenHash = $"{i:x64}", ExpiresAt = now.AddDays(-40) });
            }

            await db.SaveChangesAsync(Ct);
        });

        var counts = await Task.WhenAll(RunPurgeAsync(now), RunPurgeAsync(now), RunPurgeAsync(now));

        Assert.Equal(RefreshTokenPurgeJob.BatchSize + 500, counts.Sum());
        Assert.Equal(1, await WithDbAsync(db => db.RefreshTokens.CountAsync(Ct))); // the sign-in's live token
    }

    private async Task<Guid> TokenAsync(string subject, DateTimeOffset expiresAt, DateTimeOffset? revokedAt = null)
    {
        var session = await SignInDevAsync(subject, subject);
        var hash = SessionService.Hash(session.RefreshToken);
        await WithDbAsync(db => db.RefreshTokens.Where(t => t.TokenHash == hash)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.ExpiresAt, expiresAt).SetProperty(t => t.RevokedAt, revokedAt), Ct));
        return await WithDbAsync(db => db.RefreshTokens.Where(t => t.TokenHash == hash).Select(t => t.Id).SingleAsync(Ct));
    }

    private async Task<int> RunPurgeAsync(DateTimeOffset now)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var job = ActivatorUtilities.CreateInstance<RefreshTokenPurgeJob>(scope.ServiceProvider, new FakeTimeProvider(now));
        return await job.RunAsync(Ct);
    }
}
