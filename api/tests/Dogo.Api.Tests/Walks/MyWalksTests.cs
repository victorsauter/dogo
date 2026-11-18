using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Walks;
using Dogo.Api.Tests.Infrastructure;

namespace Dogo.Api.Tests.Walks;

public sealed class MyWalksTests(ApiFixture fixture) : WalkTestBase(fixture)
{
    private static async Task<List<MyWalkResponse>> MyWalksAsync(HttpClient client, string query)
    {
        var response = await client.GetAsync($"/api/v1/me/walks?{query}", Ct);
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
        return (await response.Content.ReadFromJsonAsync<List<MyWalkResponse>>(Json, Ct))!;
    }

    [Fact]
    public async Task Organizer_upcoming_lists_my_walks_soonest_first_including_cancelled_ones()
    {
        var (me, _) = await SignedInAsync("me", "Me");
        var later = await CreateWalkAsync(me, ("startsAt", Tomorrow.AddDays(2)));
        var sooner = await CreateWalkAsync(me, ("startsAt", Tomorrow));
        var cancelled = await CreateWalkAsync(me, ("startsAt", Tomorrow.AddDays(1)));
        await me.PostAsync($"/api/v1/walks/{cancelled.Id}/cancel", null, Ct);
        var past = await CreateWalkAsync(me);
        await MoveWalkStartAsync(past.Id, DateTimeOffset.UtcNow.AddDays(-1));
        var (other, _) = await SignedInAsync("other", "Other");
        await CreateWalkAsync(other);

        var walks = await MyWalksAsync(me, "role=Organizer");

        Assert.Equal([sooner.Id, cancelled.Id, later.Id], walks.Select(w => w.Id));
        Assert.Equal(WalkStatus.Cancelled, walks[1].Status);
        Assert.Equal(walks, await MyWalksAsync(me, "role=Organizer&when=Upcoming"), new MyWalkIdComparer());
    }

    [Fact]
    public async Task Organizer_past_lists_started_walks_most_recent_first()
    {
        var (me, _) = await SignedInAsync();
        var older = await CreateWalkAsync(me);
        var recent = await CreateWalkAsync(me);
        await CreateWalkAsync(me);
        await MoveWalkStartAsync(older.Id, DateTimeOffset.UtcNow.AddDays(-5));
        await MoveWalkStartAsync(recent.Id, DateTimeOffset.UtcNow.AddHours(-1));

        var walks = await MyWalksAsync(me, "role=Organizer&when=Past");

        Assert.Equal([recent.Id, older.Id], walks.Select(w => w.Id));
    }

    [Fact]
    public async Task Participant_lists_walks_where_my_dogs_are_pending_or_accepted()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var accepted = await CreateWalkAsync(organizer, ("startsAt", Tomorrow));
        var pending = await CreateWalkAsync(organizer, ("startsAt", Tomorrow.AddHours(1)), ("access", "Approval"));
        var declined = await CreateWalkAsync(organizer, ("startsAt", Tomorrow.AddHours(2)));
        var cancelledRegistration = await CreateWalkAsync(organizer, ("startsAt", Tomorrow.AddHours(3)));
        var cancelledWalk = await CreateWalkAsync(organizer, ("startsAt", Tomorrow.AddHours(4)));
        await CreateWalkAsync(organizer, ("startsAt", Tomorrow.AddHours(5)));
        var (alice, _, dog) = await DogOwnerAsync("alice");

        var acceptedRegistration = Assert.Single(await RegisterOkAsync(alice, accepted.Id, dog.Id));
        var pendingRegistration = Assert.Single(await RegisterOkAsync(alice, pending.Id, dog.Id));
        await DeclineAsync(organizer, declined.Id, Assert.Single(await RegisterOkAsync(alice, declined.Id, dog.Id)).Id);
        await CancelRegistrationAsync(alice, cancelledRegistration.Id, Assert.Single(await RegisterOkAsync(alice, cancelledRegistration.Id, dog.Id)).Id);
        await RegisterOkAsync(alice, cancelledWalk.Id, dog.Id);
        await organizer.PostAsync($"/api/v1/walks/{cancelledWalk.Id}/cancel", null, Ct);

        var walks = await MyWalksAsync(alice, "role=Participant");

        Assert.Equal([accepted.Id, pending.Id, cancelledWalk.Id], walks.Select(w => w.Id));
        Assert.Equal(new MyRegistrationResponse(acceptedRegistration.Id, dog.Id, RegistrationStatus.Accepted), Assert.Single(walks[0].MyRegistrations));
        Assert.Equal(new MyRegistrationResponse(pendingRegistration.Id, dog.Id, RegistrationStatus.Pending), Assert.Single(walks[1].MyRegistrations));
        Assert.Equal(1, walks[0].AcceptedDogsCount);
        Assert.Equal(0, walks[1].AcceptedDogsCount);
        Assert.Equal(WalkStatus.Cancelled, walks[2].Status);
        Assert.Equal("Organizer", walks[0].Organizer.DisplayName);
        Assert.False(walks[0].IsProfessional);
        Assert.Null(walks[0].Organization);
        Assert.False(walks[0].RepeatsWeekly);
        Assert.False(walks[0].HasBlockedParticipant);

        Assert.Empty(await MyWalksAsync(organizer, "role=Participant"));
    }

    [Fact]
    public async Task My_registrations_include_every_status_on_a_listed_walk()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (alice, _, first) = await DogOwnerAsync("alice");
        var second = await CreateDogOfSizeAsync(alice, "Second", "Small");
        var registrations = await RegisterOkAsync(alice, walk.Id, first.Id, second.Id);
        await CancelRegistrationAsync(alice, walk.Id, registrations[1].Id);

        var listed = Assert.Single(await MyWalksAsync(alice, "role=Participant"));

        Assert.Equal(
            [RegistrationStatus.Accepted, RegistrationStatus.Cancelled],
            listed.MyRegistrations.OrderBy(r => r.Status).Select(r => r.Status));
    }

    [Fact]
    public async Task Participant_past_lists_started_walks_most_recent_first()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var older = await CreateWalkAsync(organizer);
        var recent = await CreateWalkAsync(organizer);
        var upcoming = await CreateWalkAsync(organizer);
        var (alice, _, dog) = await DogOwnerAsync("alice");
        foreach (var walk in new[] { older, recent, upcoming })
        {
            await RegisterOkAsync(alice, walk.Id, dog.Id);
        }

        await MoveWalkStartAsync(older.Id, DateTimeOffset.UtcNow.AddDays(-7));
        await MoveWalkStartAsync(recent.Id, DateTimeOffset.UtcNow.AddDays(-1));

        Assert.Equal([recent.Id, older.Id], (await MyWalksAsync(alice, "role=Participant&when=Past")).Select(w => w.Id));
        Assert.Equal([upcoming.Id], (await MyWalksAsync(alice, "role=Participant&when=Upcoming")).Select(w => w.Id));
    }

    [Fact]
    public async Task Unknown_filter_values_are_rejected()
    {
        var (me, _) = await SignedInAsync();

        await AssertProblemAsync(await me.GetAsync("/api/v1/me/walks?role=Guest", Ct), HttpStatusCode.BadRequest, "request.invalid");
        await AssertProblemAsync(await me.GetAsync("/api/v1/me/walks?role=Organizer&when=Someday", Ct), HttpStatusCode.BadRequest, "request.invalid");
    }

    [Fact]
    public async Task My_walks_honours_the_limit()
    {
        var (me, _) = await SignedInAsync();
        var first = await CreateWalkAsync(me, ("startsAt", Tomorrow));
        await CreateWalkAsync(me, ("startsAt", Tomorrow.AddHours(1)));

        Assert.Equal(first.Id, Assert.Single(await MyWalksAsync(me, "role=Organizer&limit=1")).Id);
    }

    [Fact]
    public async Task Role_is_required()
    {
        var (me, _) = await SignedInAsync();

        await AssertValidationProblemAsync(await me.GetAsync("/api/v1/me/walks", Ct), "role");
        await AssertValidationProblemAsync(await me.GetAsync("/api/v1/me/walks?role=Organizer&limit=101", Ct), "limit");
    }

    private sealed class MyWalkIdComparer : IEqualityComparer<MyWalkResponse>
    {
        public bool Equals(MyWalkResponse? x, MyWalkResponse? y) => x?.Id == y?.Id;

        public int GetHashCode(MyWalkResponse obj) => obj.Id.GetHashCode();
    }
}
