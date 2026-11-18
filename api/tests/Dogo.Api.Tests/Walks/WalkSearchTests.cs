using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Dogs;
using Dogo.Api.Features.Walks;
using Dogo.Api.Tests.Infrastructure;

namespace Dogo.Api.Tests.Walks;

public sealed class WalkSearchTests(ApiFixture fixture) : WalkTestBase(fixture)
{
    /// <summary>Length of one degree of latitude around Paris, in kilometres.</summary>
    private const double KmPerDegreeOfLatitude = 111.2;

    private static object NorthOfParis(double km) =>
        new { latitude = ParisLatitude + (km / KmPerDegreeOfLatitude), longitude = ParisLongitude };

    private static string SearchUrl(string? extra = null) =>
        string.Create(CultureInfo.InvariantCulture, $"/api/v1/walks?lat={ParisLatitude}&lng={ParisLongitude}{(extra is null ? "" : "&" + extra)}");

    private static string Iso(DateTimeOffset value) => Uri.EscapeDataString(value.ToString("O", CultureInfo.InvariantCulture));

    private static async Task<List<WalkSearchResult>> SearchAsync(HttpClient client, string? extra = null)
    {
        var response = await client.GetAsync(SearchUrl(extra), Ct);
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
        return (await response.Content.ReadFromJsonAsync<List<WalkSearchResult>>(Json, Ct))!;
    }

    [Fact]
    public async Task Search_returns_walks_within_the_default_radius_with_their_distance()
    {
        var (client, session) = await SignedInAsync("organizer", "Organizer");
        var near = await CreateWalkAsync(client, ("title", "Proche"), ("location", NorthOfParis(1)));
        var mid = await CreateWalkAsync(client, ("title", "Moyenne"), ("location", NorthOfParis(5)), ("startsAt", Tomorrow.AddHours(1)));
        await CreateWalkAsync(client, ("title", "Loin"), ("location", NorthOfParis(20)));

        var results = await SearchAsync(client);

        Assert.Equal([near.Id, mid.Id], results.Select(r => r.Id));
        Assert.InRange(results[0].DistanceMeters, 980, 1020);
        Assert.InRange(results[1].DistanceMeters, 4900, 5100);

        var item = results[0];
        Assert.Equal("Proche", item.Title);
        Assert.Equal(near.StartsAt, item.StartsAt);
        Assert.Equal(near.DurationMinutes, item.DurationMinutes);
        Assert.Equal(near.Location, item.Location);
        Assert.Equal(near.LocationLabel, item.LocationLabel);
        Assert.Equal(near.MaxDogs, item.MaxDogs);
        Assert.Equal(0, item.AcceptedDogsCount);
        Assert.Equal(near.AllowedSizes, item.AllowedSizes);
        Assert.Equal(near.LeashRule, item.LeashRule);
        Assert.Equal(near.Access, item.Access);
        Assert.Equal(WalkStatus.Scheduled, item.Status);
        Assert.Equal(session.User.Id, item.Organizer!.Id);
        Assert.Equal("Organizer", item.Organizer!.DisplayName);
        Assert.False(item.IsProfessional);
        Assert.Null(item.Organization);
        Assert.False(item.RepeatsWeekly);
        Assert.False(item.HasBlockedParticipant);
    }

    [Fact]
    public async Task The_radius_limits_the_results()
    {
        var (client, _) = await SignedInAsync();
        var walk = await CreateWalkAsync(client, ("location", NorthOfParis(5)));

        Assert.Empty(await SearchAsync(client, "radiusKm=4.9"));
        Assert.Equal(walk.Id, Assert.Single(await SearchAsync(client, "radiusKm=5.1")).Id);
        Assert.Single(await SearchAsync(client, "radiusKm=100"));
    }

    [Fact]
    public async Task Search_excludes_cancelled_and_started_walks()
    {
        var (client, _) = await SignedInAsync();
        var scheduled = await CreateWalkAsync(client);
        var cancelled = await CreateWalkAsync(client);
        await client.PostAsync($"/api/v1/walks/{cancelled.Id}/cancel", null, Ct);
        var started = await CreateWalkAsync(client);
        await MoveWalkStartAsync(started.Id, DateTimeOffset.UtcNow.AddMinutes(-1));

        Assert.Equal(scheduled.Id, Assert.Single(await SearchAsync(client)).Id);

        // A period starting in the past does not bring back started walks.
        Assert.Equal(scheduled.Id, Assert.Single(await SearchAsync(client, $"from={Iso(DateTimeOffset.UtcNow.AddDays(-2))}")).Id);
    }

    [Fact]
    public async Task Search_filters_by_period()
    {
        var (client, _) = await SignedInAsync();
        var now = DateTimeOffset.UtcNow;
        var inOneDay = await CreateWalkAsync(client, ("startsAt", now.AddDays(1)));
        var inThreeDays = await CreateWalkAsync(client, ("startsAt", now.AddDays(3)));
        var inFiveDays = await CreateWalkAsync(client, ("startsAt", now.AddDays(5)));

        var between = await SearchAsync(client, $"from={Iso(now.AddDays(2))}&to={Iso(now.AddDays(4))}");
        var fromOnly = await SearchAsync(client, $"from={Iso(now.AddDays(2))}");
        var toOnly = await SearchAsync(client, $"to={Iso(now.AddDays(4))}");
        var withOffset = await SearchAsync(client, $"from={Iso(now.AddDays(2).ToOffset(TimeSpan.FromHours(2)))}");

        Assert.Equal([inThreeDays.Id], between.Select(r => r.Id));
        Assert.Equal([inThreeDays.Id, inFiveDays.Id], fromOnly.Select(r => r.Id));
        Assert.Equal([inOneDay.Id, inThreeDays.Id], toOnly.Select(r => r.Id));
        Assert.Equal([inThreeDays.Id, inFiveDays.Id], withOffset.Select(r => r.Id));
    }

    [Fact]
    public async Task The_period_end_must_be_after_its_start()
    {
        var (client, _) = await SignedInAsync();
        var now = DateTimeOffset.UtcNow;

        var response = await client.GetAsync(SearchUrl($"from={Iso(now.AddDays(3))}&to={Iso(now.AddDays(2))}"), Ct);

        await AssertValidationProblemAsync(response, "to");
    }

    [Fact]
    public async Task Search_filters_by_allowed_size()
    {
        var (client, _) = await SignedInAsync();
        var small = await CreateWalkAsync(client, ("allowedSizes", new[] { "Small" }), ("startsAt", Tomorrow));
        await CreateWalkAsync(client, ("allowedSizes", new[] { "Large" }), ("startsAt", Tomorrow.AddHours(1)));
        var both = await CreateWalkAsync(client, ("allowedSizes", new[] { "Small", "Large" }), ("startsAt", Tomorrow.AddHours(2)));

        Assert.Equal([small.Id, both.Id], (await SearchAsync(client, "size=Small")).Select(r => r.Id));
        Assert.Empty(await SearchAsync(client, "size=Medium"));
        Assert.Equal(3, (await SearchAsync(client)).Count);
    }

    [Fact]
    public async Task Results_are_sorted_by_start_then_distance()
    {
        var (client, _) = await SignedInAsync();
        var laterFar = await CreateWalkAsync(client, ("location", NorthOfParis(3)), ("startsAt", Tomorrow.AddHours(2)));
        var laterNear = await CreateWalkAsync(client, ("location", NorthOfParis(1)), ("startsAt", Tomorrow.AddHours(2)));
        var soonFarthest = await CreateWalkAsync(client, ("location", NorthOfParis(8)), ("startsAt", Tomorrow));

        var results = await SearchAsync(client);

        Assert.Equal([soonFarthest.Id, laterNear.Id, laterFar.Id], results.Select(r => r.Id));
    }

    [Fact]
    public async Task Accepted_dogs_count_only_counts_accepted_registrations()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"));
        await RegisterOkAsync(organizer, walk.Id, (await CreateDogAsync(organizer, ValidDog("A"))).Id, (await CreateDogAsync(organizer, ValidDog("B"))).Id);
        var (alice, _, aliceDog) = await DogOwnerAsync("alice");
        await RegisterOkAsync(alice, walk.Id, aliceDog.Id);
        var (bob, _, bobDog) = await DogOwnerAsync("bob");
        var bobRegistration = Assert.Single(await RegisterOkAsync(bob, walk.Id, bobDog.Id));
        await CancelRegistrationAsync(bob, walk.Id, bobRegistration.Id);

        var result = Assert.Single(await SearchAsync(alice));

        Assert.Equal(2, result.AcceptedDogsCount);
    }

    [Fact]
    public async Task Search_honours_the_limit()
    {
        var (client, _) = await SignedInAsync();
        var first = await CreateWalkAsync(client, ("startsAt", Tomorrow));
        await CreateWalkAsync(client, ("startsAt", Tomorrow.AddHours(1)));

        Assert.Equal(first.Id, Assert.Single(await SearchAsync(client, "limit=1")).Id);
    }

    [Theory]
    [InlineData("/api/v1/walks?lng=2.35", "lat")]
    [InlineData("/api/v1/walks?lat=48.85", "lng")]
    [InlineData("/api/v1/walks?lat=91&lng=2.35", "lat")]
    [InlineData("/api/v1/walks?lat=48.85&lng=-181", "lng")]
    [InlineData("/api/v1/walks?lat=48.85&lng=2.35&radiusKm=101", "radiusKm")]
    [InlineData("/api/v1/walks?lat=48.85&lng=2.35&radiusKm=0", "radiusKm")]
    [InlineData("/api/v1/walks?lat=48.85&lng=2.35&limit=0", "limit")]
    [InlineData("/api/v1/walks?lat=48.85&lng=2.35&limit=101", "limit")]
    public async Task Search_validates_its_parameters(string url, string field)
    {
        var (client, _) = await SignedInAsync();

        await AssertValidationProblemAsync(await client.GetAsync(url, Ct), field);
    }

    [Fact]
    public async Task Search_requires_authentication()
    {
        await AssertProblemAsync(await CreateClient().GetAsync(SearchUrl(), Ct), HttpStatusCode.Unauthorized, "auth.unauthenticated");
    }

    [Fact]
    public async Task Search_sizes_follow_the_enum_order()
    {
        var (client, _) = await SignedInAsync();
        await CreateWalkAsync(client, ("allowedSizes", new[] { "Large", "Medium", "Small" }));

        Assert.Equal([DogSize.Small, DogSize.Medium, DogSize.Large], Assert.Single(await SearchAsync(client)).AllowedSizes);
    }
}
