using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Blocks;
using Dogo.Api.Features.Walks;
using Dogo.Api.Tests.Infrastructure;
using Dogo.Api.Tests.Walks;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Blocks;

/// <summary>Spec §4.7 and §4.3: blocking, its effect on registrations, hasBlockedParticipant, and its invisibility.</summary>
public sealed class BlockTests(ApiFixture fixture) : WalkTestBase(fixture)
{
    private static Task<HttpResponseMessage> BlockAsync(HttpClient client, Guid userId) =>
        client.PostAsJsonAsync("/api/v1/blocks", new { userId }, Ct);

    private static async Task BlockOkAsync(HttpClient client, Guid userId)
    {
        var response = await BlockAsync(client, userId);
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
    }

    private static async Task<List<BlockResponse>> MyBlocksAsync(HttpClient client) =>
        (await client.GetFromJsonAsync<List<BlockResponse>>("/api/v1/me/blocks", Json, Ct))!;

    private string SearchUrl => $"/api/v1/walks?lat={ParisLatitude}&lng={ParisLongitude}";

    [Fact]
    public async Task Blocking_returns_the_blocked_user_and_is_idempotent()
    {
        var (me, _) = await SignedInAsync("me", "Me");
        var (_, bob) = await SignedInAsync("bob", "Bob");

        var first = await BlockAsync(me, bob.User.Id);
        var second = await BlockAsync(me, bob.User.Id);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        var body = await ReadJsonAsync(first);
        Assert.Equal(["user", "createdAt"], body.EnumerateObject().Select(p => p.Name));
        Assert.Equal(["id", "displayName", "photoUrl"], body.GetProperty("user").EnumerateObject().Select(p => p.Name));
        Assert.Equal(bob.User.Id, body.GetProperty("user").GetProperty("id").GetGuid());
        Assert.Equal(body.GetProperty("createdAt").GetDateTimeOffset(), (await ReadJsonAsync(second)).GetProperty("createdAt").GetDateTimeOffset());
        Assert.Equal(1, await WithDbAsync(db => db.Blocks.CountAsync(Ct)));
    }

    [Fact]
    public async Task Blocking_yourself_or_an_unknown_user_is_refused()
    {
        var (me, session) = await SignedInAsync("me", "Me");

        await AssertProblemAsync(await BlockAsync(me, session.User.Id), HttpStatusCode.BadRequest, "block.self");
        await AssertProblemAsync(await BlockAsync(me, Guid.NewGuid()), HttpStatusCode.NotFound, "user.not_found");
        await AssertValidationProblemAsync(await me.PostAsJsonAsync("/api/v1/blocks", new { }, Ct), "userId");
        Assert.Equal(0, await WithDbAsync(db => db.Blocks.CountAsync(Ct)));
    }

    [Fact]
    public async Task My_blocks_lists_the_people_I_blocked_most_recent_first()
    {
        var (me, _) = await SignedInAsync("me", "Me");
        var (_, bob) = await SignedInAsync("bob", "Bob");
        var (_, carol) = await SignedInAsync("carol", "Carol");
        var (other, _) = await SignedInAsync("other", "Other");
        await BlockOkAsync(me, bob.User.Id);
        await BlockOkAsync(me, carol.User.Id);
        await BlockOkAsync(other, bob.User.Id);

        var blocks = await MyBlocksAsync(me);

        Assert.Equal([carol.User.Id, bob.User.Id], blocks.Select(b => b.User.Id));
        Assert.Equal("Carol", blocks[0].User.DisplayName);
        Assert.Single(await me.GetFromJsonAsync<List<BlockResponse>>("/api/v1/me/blocks?limit=1", Json, Ct) ?? []);
        await AssertValidationProblemAsync(await me.GetAsync("/api/v1/me/blocks?limit=0", Ct), "limit");
    }

    [Fact]
    public async Task Unblocking_is_idempotent_and_touches_only_my_blocks()
    {
        var (me, _) = await SignedInAsync("me", "Me");
        var (_, bob) = await SignedInAsync("bob", "Bob");
        var (other, _) = await SignedInAsync("other", "Other");
        await BlockOkAsync(me, bob.User.Id);
        await BlockOkAsync(other, bob.User.Id);

        Assert.Equal(HttpStatusCode.NoContent, (await me.DeleteAsync($"/api/v1/blocks/{bob.User.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await me.DeleteAsync($"/api/v1/blocks/{bob.User.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await me.DeleteAsync($"/api/v1/blocks/{Guid.NewGuid()}", Ct)).StatusCode);

        Assert.Empty(await MyBlocksAsync(me));
        Assert.Single(await MyBlocksAsync(other));
    }

    [Fact]
    public async Task A_blocked_user_cannot_register_to_the_blockers_walks_and_is_not_told_why()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (bob, bobId, dog) = await DogOwnerAsync("bob");
        await BlockOkAsync(organizer, bobId);

        var response = await RegisterAsync(bob, walk.Id, dog.Id);

        var problem = await AssertProblemAsync(response, HttpStatusCode.Forbidden, "walk.not_allowed");
        Assert.DoesNotContain("block", problem.ToString(), StringComparison.OrdinalIgnoreCase);
        Assert.Equal(0, await WithDbAsync(db => db.Registrations.CountAsync(Ct)));

        // Other organizers' walks are not concerned, and unblocking lifts the rule.
        var (other, _) = await SignedInAsync("other", "Other");
        await RegisterOkAsync(bob, (await CreateWalkAsync(other)).Id, dog.Id);
        await organizer.DeleteAsync($"/api/v1/blocks/{bobId}", Ct);
        await RegisterOkAsync(bob, walk.Id, dog.Id);
    }

    [Fact]
    public async Task Blocking_the_organizer_does_not_stop_me_from_registering()
    {
        var (organizer, organizerSession) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (bob, _, dog) = await DogOwnerAsync("bob");
        await BlockOkAsync(bob, organizerSession.User.Id);

        await RegisterOkAsync(bob, walk.Id, dog.Id);
    }

    [Fact]
    public async Task Existing_registrations_are_kept_and_a_pending_request_can_still_be_accepted()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var open = await CreateWalkAsync(organizer);
        var approval = await CreateWalkAsync(organizer, ("access", "Approval"));
        var (bob, bobId, dog) = await DogOwnerAsync("bob");
        var accepted = Assert.Single(await RegisterOkAsync(bob, open.Id, dog.Id));
        var pending = Assert.Single(await RegisterOkAsync(bob, approval.Id, dog.Id));

        await BlockOkAsync(organizer, bobId);

        Assert.Equal(RegistrationStatus.Accepted, await WithDbAsync(db => db.Registrations.Where(r => r.Id == accepted.Id).Select(r => r.Status).SingleAsync(Ct)));
        Assert.Equal(HttpStatusCode.OK, (await AcceptAsync(organizer, approval.Id, pending.Id)).StatusCode);
    }

    [Fact]
    public async Task Has_blocked_participant_flags_walks_whose_organizer_I_blocked_in_every_view()
    {
        var (organizer, organizerSession) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (me, _, myDog) = await DogOwnerAsync("me");
        await RegisterOkAsync(me, walk.Id, myDog.Id);
        var (neutral, _) = await SignedInAsync("neutral", "Neutral");

        await BlockOkAsync(me, organizerSession.User.Id);

        Assert.True((await GetWalkAsync(me, walk.Id)).HasBlockedParticipant);
        Assert.True(Assert.Single((await me.GetFromJsonAsync<List<WalkSearchResult>>(SearchUrl, Json, Ct))!).HasBlockedParticipant);
        Assert.True(Assert.Single((await me.GetFromJsonAsync<List<MyWalkResponse>>("/api/v1/me/walks?role=Participant", Json, Ct))!).HasBlockedParticipant);

        // Only for the blocker.
        Assert.False((await GetWalkAsync(neutral, walk.Id)).HasBlockedParticipant);
        Assert.False((await GetWalkAsync(organizer, walk.Id)).HasBlockedParticipant);
        Assert.False(Assert.Single((await organizer.GetFromJsonAsync<List<MyWalkResponse>>("/api/v1/me/walks?role=Organizer", Json, Ct))!).HasBlockedParticipant);
    }

    [Fact]
    public async Task Has_blocked_participant_flags_walks_with_an_accepted_participant_I_blocked()
    {
        var (me, _) = await SignedInAsync("me", "Me");
        var mine = await CreateWalkAsync(me, ("access", "Approval"));
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"));
        var (bob, bobId, bobDog) = await DogOwnerAsync("bob");
        var request = Assert.Single(await RegisterOkAsync(bob, walk.Id, bobDog.Id));
        var requestOnMine = Assert.Single(await RegisterOkAsync(bob, mine.Id, bobDog.Id));
        await BlockOkAsync(me, bobId);

        // A pending request does not count...
        Assert.False((await GetWalkAsync(me, walk.Id)).HasBlockedParticipant);
        Assert.False(Assert.Single((await me.GetFromJsonAsync<List<MyWalkResponse>>("/api/v1/me/walks?role=Organizer", Json, Ct))!).HasBlockedParticipant);

        // ...an accepted one does.
        await AcceptAsync(organizer, walk.Id, request.Id);
        await AcceptAsync(me, mine.Id, requestOnMine.Id);
        Assert.True((await GetWalkAsync(me, walk.Id)).HasBlockedParticipant);
        Assert.All((await me.GetFromJsonAsync<List<WalkSearchResult>>(SearchUrl, Json, Ct))!, w => Assert.True(w.HasBlockedParticipant));
        Assert.True(Assert.Single((await me.GetFromJsonAsync<List<MyWalkResponse>>("/api/v1/me/walks?role=Organizer", Json, Ct))!).HasBlockedParticipant);

        // A cancelled registration no longer counts.
        await CancelRegistrationAsync(bob, walk.Id, request.Id);
        Assert.False((await GetWalkAsync(me, walk.Id)).HasBlockedParticipant);
    }

    [Fact]
    public async Task The_blocked_person_cannot_detect_the_block()
    {
        var (organizer, organizerSession) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (bob, bobId, dog) = await DogOwnerAsync("bob");
        await RegisterOkAsync(bob, walk.Id, dog.Id);
        var later = await CreateWalkAsync(organizer, ("startsAt", Tomorrow.AddDays(1)));

        async Task<string[]> SnapshotAsync() =>
        [
            await bob.GetStringAsync($"/api/v1/walks/{walk.Id}", Ct),
            await bob.GetStringAsync(SearchUrl, Ct),
            await bob.GetStringAsync("/api/v1/me/walks?role=Participant", Ct),
            await bob.GetStringAsync($"/api/v1/users/{organizerSession.User.Id}", Ct),
            await bob.GetStringAsync("/api/v1/me/blocks", Ct),
            await bob.GetStringAsync("/api/v1/me", Ct),
        ];

        var before = await SnapshotAsync();
        await BlockOkAsync(organizer, bobId);
        var after = await SnapshotAsync();

        Assert.Equal(before, after);
        Assert.Empty(await SentPushesAsync());

        // Refused registration: the same answer as for any walk closed to the user, nothing about a block.
        var problem = await AssertProblemAsync(await RegisterAsync(bob, later.Id, dog.Id), HttpStatusCode.Forbidden, "walk.not_allowed");
        Assert.Equal("Registration to this walk is not possible.", problem.GetProperty("title").GetString());
        Assert.False(problem.TryGetProperty("detail", out _));
    }
}
