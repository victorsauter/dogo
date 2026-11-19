using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Users;
using Dogo.Api.Features.Walks;
using Dogo.Api.Tests.Infrastructure;
using Dogo.Api.Tests.Walks;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Admin;

/// <summary>ADR 0036: suspending an account freezes it, cancels what it organises and lets it leave.</summary>
public sealed class AccountSuspensionTests(ApiFixture fixture) : WalkTestBase(fixture)
{
    private async Task SuspendAsync(Guid userId)
    {
        var (admin, _) = await AdminAsync();
        var response = await admin.PostAsync($"/api/v1/admin/users/{userId}/suspend", null, Ct);
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
    }

    private async Task UnsuspendAsync(Guid userId)
    {
        var (admin, _) = await AdminAsync();
        var response = await admin.PostAsync($"/api/v1/admin/users/{userId}/unsuspend", null, Ct);
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
    }

    private Task<WalkStatus> WalkStatusAsync(Guid walkId) =>
        WithDbAsync(db => db.Walks.Where(w => w.Id == walkId).Select(w => w.Status).SingleAsync(Ct));

    [Fact]
    public async Task Suspending_stops_the_series_cancels_upcoming_walks_and_removes_the_devices()
    {
        var (alice, aliceSession) = await SignedInAsync("alice", "Alice");
        var aliceId = aliceSession.User.Id;
        await RegisterDeviceAsync(alice, "alice");
        var (bob, bobId, bobDog) = await DogOwnerAsync("bob");
        var (carol, carolId, carolDog) = await DogOwnerAsync("carol");
        await RegisterDeviceAsync(bob, "bob");
        await RegisterDeviceAsync(carol, "carol");

        // Alice organises: an upcoming walk with an accepted and a pending registrant, a weekly walk, a past walk.
        var upcoming = await CreateWalkAsync(alice, ("access", "Approval"), ("title", "Tour du lac"));
        await AcceptAsync(alice, upcoming.Id, Assert.Single(await RegisterOkAsync(bob, upcoming.Id, bobDog.Id)).Id);
        await RegisterOkAsync(carol, upcoming.Id, carolDog.Id);
        var weeklyStart = Tomorrow.AddDays(1);
        var weekly = await CreateWalkAsync(alice, ("repeatWeekly", true), ("startsAt", weeklyStart), ("title", "Chaque semaine"));
        var past = await CreateWalkAsync(alice, ("title", "Balade passée"));
        await MoveWalkStartAsync(past.Id, DateTimeOffset.UtcNow.AddHours(-3));
        await WaitForNotificationsAsync();
        Factory.PushSender.Clear();

        await SuspendAsync(aliceId);

        // Upcoming walks cancelled as by their organizer; the past one is untouched.
        Assert.Equal(WalkStatus.Cancelled, await WalkStatusAsync(upcoming.Id));
        Assert.Equal(WalkStatus.Cancelled, await WalkStatusAsync(weekly.Id));
        Assert.Equal(WalkStatus.Scheduled, await WalkStatusAsync(past.Id));

        // Accepted and pending registrants are told, after the commit; Alice's devices are gone.
        var pushes = await SentPushesAsync();
        var cancelled = pushes.Where(p => p.Data["type"] == "walk_cancelled" && p.Data["walkId"] == upcoming.Id.ToString()).ToList();
        Assert.Equivalent(new[] { bobId, carolId }, cancelled.Select(p => p.UserId));
        Assert.DoesNotContain(pushes, p => p.UserId == aliceId);
        Assert.Equal(0, await WithDbAsync(db => db.Devices.CountAsync(d => d.UserId == aliceId, Ct)));
        Assert.Equal(2, await WithDbAsync(db => db.Devices.CountAsync(Ct)));

        // The series is stopped: no walk is created once its latest one has passed.
        Assert.False(await WithDbAsync(db => db.WalkSeries.Where(s => s.OrganizerId == aliceId).Select(s => s.Active).SingleAsync(Ct)));
        Assert.Equal(0, await RunSeriesJobAsync(weeklyStart.AddHours(2)));

        // Frozen: sessions revoked, writes refused, reads allowed.
        await AssertProblemAsync(
            await CreateClient().PostAsJsonAsync("/api/v1/auth/refresh", new { refreshToken = aliceSession.RefreshToken }, Ct),
            HttpStatusCode.Unauthorized,
            "auth.invalid_token");
        await AssertProblemAsync(await alice.PostAsJsonAsync("/api/v1/walks", ValidWalk(), Ct), HttpStatusCode.Forbidden, "account.suspended");
        Assert.Equal(HttpStatusCode.OK, (await alice.GetAsync("/api/v1/me", Ct)).StatusCode);
    }

    [Fact]
    public async Task Suspending_twice_changes_nothing_more()
    {
        var (alice, aliceSession) = await SignedInAsync("alice", "Alice");
        var (bob, _, bobDog) = await DogOwnerAsync("bob");
        await RegisterDeviceAsync(bob, "bob");
        var walk = await CreateWalkAsync(alice);
        await RegisterOkAsync(bob, walk.Id, bobDog.Id);
        await SuspendAsync(aliceSession.User.Id);
        await WaitForNotificationsAsync();
        Factory.PushSender.Clear();

        await SuspendAsync(aliceSession.User.Id);

        Assert.Empty(await SentPushesAsync());
        Assert.Equal(WalkStatus.Cancelled, await WalkStatusAsync(walk.Id));
    }

    [Fact]
    public async Task Lifting_the_suspension_restores_nothing()
    {
        var (alice, aliceSession) = await SignedInAsync("alice", "Alice");
        var aliceId = aliceSession.User.Id;
        await RegisterDeviceAsync(alice, "alice");
        var walk = await CreateWalkAsync(alice, ("repeatWeekly", true));
        await SuspendAsync(aliceId);

        await UnsuspendAsync(aliceId);

        Assert.Equal(UserStatus.Active, await WithDbAsync(db => db.Users.Where(u => u.Id == aliceId).Select(u => u.Status).SingleAsync(Ct)));
        Assert.Equal(WalkStatus.Cancelled, await WalkStatusAsync(walk.Id));
        Assert.False(await WithDbAsync(db => db.WalkSeries.Where(s => s.OrganizerId == aliceId).Select(s => s.Active).SingleAsync(Ct)));
        Assert.Equal(0, await WithDbAsync(db => db.Devices.CountAsync(d => d.UserId == aliceId, Ct)));
        await AssertProblemAsync(
            await CreateClient().PostAsJsonAsync("/api/v1/auth/refresh", new { refreshToken = aliceSession.RefreshToken }, Ct),
            HttpStatusCode.Unauthorized,
            "auth.invalid_token");

        // Writing works again, with the access token still valid or after signing in again.
        Assert.Equal(HttpStatusCode.OK, (await alice.PatchAsJsonAsync("/api/v1/me", new { bio = "De retour" }, Ct)).StatusCode);
    }

    [Fact]
    public async Task Suspending_cancels_the_upcoming_registrations_to_other_walks_and_frees_the_places()
    {
        var (alice, aliceId, aliceDog) = await DogOwnerAsync("alice");
        var (bob, _, _) = await DogOwnerAsync("bob");
        var (carol, _, carolDog) = await DogOwnerAsync("carol");

        // A full walk where Alice has the only place, an approval walk where she waits, a past walk she joined.
        var full = await CreateWalkAsync(bob, ("maxDogs", 1), ("title", "Complète"));
        await RegisterOkAsync(alice, full.Id, aliceDog.Id);
        await AssertProblemAsync(await RegisterAsync(carol, full.Id, carolDog.Id), HttpStatusCode.Conflict, "walk.full");
        var approval = await CreateWalkAsync(bob, ("access", "Approval"), ("title", "Sur demande"));
        await RegisterOkAsync(alice, approval.Id, aliceDog.Id);
        var past = await CreateWalkAsync(bob, ("title", "Passée"));
        await RegisterOkAsync(alice, past.Id, aliceDog.Id);
        await MoveWalkStartAsync(past.Id, DateTimeOffset.UtcNow.AddHours(-3));

        await SuspendAsync(aliceId);

        var statuses = await WithDbAsync(db => db.Registrations.Where(r => r.UserId == aliceId).ToDictionaryAsync(r => r.WalkId, r => r.Status, Ct));
        Assert.Equal(RegistrationStatus.Cancelled, statuses[full.Id]);
        Assert.Equal(RegistrationStatus.Cancelled, statuses[approval.Id]);
        Assert.Equal(RegistrationStatus.Accepted, statuses[past.Id]);

        // The place is free again.
        await RegisterOkAsync(carol, full.Id, carolDog.Id);
    }

    [Fact]
    public async Task Suspending_an_unknown_account_is_not_found()
    {
        var (admin, _) = await AdminAsync();

        await AssertProblemAsync(await admin.PostAsync($"/api/v1/admin/users/{Guid.NewGuid()}/suspend", null, Ct), HttpStatusCode.NotFound, "user.not_found");
        await AssertProblemAsync(await admin.PostAsync($"/api/v1/admin/users/{Guid.NewGuid()}/unsuspend", null, Ct), HttpStatusCode.NotFound, "user.not_found");
    }
}
