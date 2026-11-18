using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Walks;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Walks;

/// <summary>Weekly series (spec §4.5): creation, next walk, catch-up, concurrency, stop, daylight saving.</summary>
public sealed class WalkSeriesTests(ApiFixture fixture) : WalkTestBase(fixture)
{
    /// <summary>A Tuesday in June 2031, 10:00 in Paris (summer time): far from any clock change.</summary>
    private static readonly DateTimeOffset JuneStart = new(2031, 6, 3, 8, 0, 0, TimeSpan.Zero);

    private Task<List<Walk>> SeriesWalksAsync(Guid seriesId) =>
        WithDbAsync(db => db.Walks.AsNoTracking().Where(w => w.SeriesId == seriesId).OrderBy(w => w.StartsAt).ToListAsync(Ct));

    private Task<Guid> SeriesIdAsync(Guid walkId) =>
        WithDbAsync(db => db.Walks.Where(w => w.Id == walkId).Select(w => w.SeriesId!.Value).SingleAsync(Ct));

    private static Task<HttpResponseMessage> StopSeriesAsync(HttpClient client, Guid walkId) =>
        client.PostAsync($"/api/v1/walks/{walkId}/stop-series", null, Ct);

    [Fact]
    public async Task A_walk_created_with_repeat_weekly_belongs_to_an_active_series()
    {
        var (client, session) = await SignedInAsync();

        var walk = await CreateWalkAsync(client, ("repeatWeekly", true));

        Assert.True(walk.RepeatsWeekly);
        var series = await WithDbAsync(db => db.WalkSeries.SingleAsync(Ct));
        Assert.Equal("Europe/Paris", series.TimeZone);
        Assert.True(series.Active);
        Assert.Equal(session.User.Id, series.OrganizerId);
        Assert.Equal(series.Id, await SeriesIdAsync(walk.Id));
        Assert.True((await GetWalkAsync(client, walk.Id)).RepeatsWeekly);
        var mine = await client.GetFromJsonAsync<List<MyWalkResponse>>("/api/v1/me/walks?role=Organizer", Json, Ct);
        Assert.True(Assert.Single(mine!).RepeatsWeekly);
        var found = await client.GetFromJsonAsync<List<WalkSearchResult>>($"/api/v1/walks?lat={ParisLatitude}&lng={ParisLongitude}", Json, Ct);
        Assert.True(Assert.Single(found!).RepeatsWeekly);
    }

    [Fact]
    public async Task A_walk_does_not_repeat_by_default()
    {
        var (client, _) = await SignedInAsync();

        var walk = await CreateWalkAsync(client);

        Assert.False(walk.RepeatsWeekly);
        Assert.Equal(0, await WithDbAsync(db => db.WalkSeries.CountAsync(Ct)));
        Assert.Equal(0, await RunSeriesJobAsync(Tomorrow.AddDays(1)));
    }

    [Fact]
    public async Task Nothing_is_created_before_the_latest_walk_starts()
    {
        var (client, _) = await SignedInAsync();
        await CreateWalkAsync(client, ("repeatWeekly", true), ("startsAt", JuneStart));

        Assert.Equal(0, await RunSeriesJobAsync(JuneStart.AddSeconds(-1)));
        Assert.Equal(1, await WithDbAsync(db => db.Walks.CountAsync(Ct)));
    }

    [Fact]
    public async Task When_a_series_walk_starts_the_next_one_is_created_a_week_later()
    {
        var (organizer, _) = await SignedInAsync("organizer", "organizer");
        var first = await CreateWalkAsync(organizer, ("repeatWeekly", true), ("startsAt", JuneStart), ("access", "Approval"), ("title", "Balade du mardi"));
        var (accepted, acceptedId, acceptedDog) = await DogOwnerAsync("accepted");
        await RegisterDeviceAsync(accepted, "accepted");
        await AcceptAsync(organizer, first.Id, Assert.Single(await RegisterOkAsync(accepted, first.Id, acceptedDog.Id)).Id);
        var (pending, _, pendingDog) = await DogOwnerAsync("pending");
        await RegisterDeviceAsync(pending, "pending");
        await RegisterOkAsync(pending, first.Id, pendingDog.Id);
        await SentPushesAsync();
        Factory.PushSender.Clear();

        Assert.Equal(1, await RunSeriesJobAsync(JuneStart.AddMinutes(1)));

        var walks = await SeriesWalksAsync(await SeriesIdAsync(first.Id));
        Assert.Equal(2, walks.Count);
        var next = walks[1];
        Assert.Equal(JuneStart.AddDays(7), next.StartsAt);
        var detail = await GetWalkAsync(organizer, next.Id);
        Assert.Equal(
            (first.Title, first.Description, first.DurationMinutes, first.Location, first.LocationLabel, first.MaxDogs, first.LeashRule, first.Rules, first.Access, first.Organizer),
            (detail.Title, detail.Description, detail.DurationMinutes, detail.Location, detail.LocationLabel, detail.MaxDogs, detail.LeashRule, detail.Rules, detail.Access, detail.Organizer));
        Assert.Equal(first.AllowedSizes, detail.AllowedSizes);
        Assert.True(detail.RepeatsWeekly);
        Assert.Equal(0, detail.AcceptedDogsCount);
        Assert.Empty(detail.Participants);
        Assert.Empty(detail.PendingRegistrations);
        Assert.Equal(WalkStatus.Scheduled, next.Status);
        Assert.Null(next.ReminderSentAt);
        Assert.Equal(0, await WithDbAsync(db => db.Registrations.CountAsync(r => r.WalkId == next.Id, Ct)));

        // The accepted participants of the previous walk are told; pending ones are not.
        var push = Assert.Single(await SentPushesAsync());
        Assert.Equal(acceptedId, push.UserId);
        Assert.Equal("series_walk_created", push.Data["type"]);
        Assert.Equal(next.Id.ToString(), push.Data["walkId"]);
        Assert.Equal($"dogo://walks/{next.Id}", push.Data["url"]);
        Assert.Equal("Nouvelle date", push.Title);
        Assert.Equal("« Balade du mardi » revient le mardi 10 juin à 10:00. Inscris-toi à nouveau pour y participer.", push.Body);

        // Only one upcoming walk per series.
        Assert.Equal(0, await RunSeriesJobAsync(JuneStart.AddMinutes(2)));
        Assert.Equal(0, await RunSeriesJobAsync(JuneStart.AddDays(7).AddSeconds(-1)));
        Assert.Equal(1, await RunSeriesJobAsync(JuneStart.AddDays(7)));
        Assert.Equal(JuneStart.AddDays(14), (await SeriesWalksAsync(await SeriesIdAsync(first.Id)))[^1].StartsAt);
    }

    [Fact]
    public async Task The_walk_changes_preference_is_honoured_for_the_next_walk()
    {
        var (organizer, _) = await SignedInAsync("organizer", "organizer");
        var first = await CreateWalkAsync(organizer, ("repeatWeekly", true), ("startsAt", JuneStart));
        var (accepted, _, dog) = await DogOwnerAsync("accepted");
        await RegisterDeviceAsync(accepted, "accepted");
        await RegisterOkAsync(accepted, first.Id, dog.Id);
        await accepted.PutAsJsonAsync("/api/v1/me/notification-preferences",
            new { registrations = true, walkChanges = false, messages = true, reminders = true }, Ct);

        Assert.Equal(1, await RunSeriesJobAsync(JuneStart.AddMinutes(1)));

        Assert.Empty(await SentPushesAsync());
    }

    [Fact]
    public async Task After_a_downtime_only_the_first_future_occurrence_is_created()
    {
        var (client, _) = await SignedInAsync();
        var first = await CreateWalkAsync(client, ("repeatWeekly", true), ("startsAt", JuneStart));

        Assert.Equal(1, await RunSeriesJobAsync(JuneStart.AddDays(21).AddHours(1)));

        var walks = await SeriesWalksAsync(await SeriesIdAsync(first.Id));
        Assert.Equal([JuneStart, JuneStart.AddDays(28)], walks.Select(w => w.StartsAt));
    }

    [Fact]
    public async Task A_cancelled_latest_walk_still_leads_to_the_next_one()
    {
        var (client, _) = await SignedInAsync();
        var first = await CreateWalkAsync(client, ("repeatWeekly", true), ("startsAt", JuneStart));

        var cancelled = await client.PostAsync($"/api/v1/walks/{first.Id}/cancel", null, Ct);

        Assert.Equal(HttpStatusCode.OK, cancelled.StatusCode);
        Assert.True((await GetWalkAsync(client, first.Id)).RepeatsWeekly);
        Assert.Equal(0, await RunSeriesJobAsync(JuneStart.AddMinutes(-1)));
        Assert.Equal(1, await RunSeriesJobAsync(JuneStart.AddMinutes(1)));
        var walks = await SeriesWalksAsync(await SeriesIdAsync(first.Id));
        Assert.Equal([WalkStatus.Cancelled, WalkStatus.Scheduled], walks.Select(w => w.Status));
    }

    [Fact]
    public async Task Concurrent_runs_create_a_single_next_walk()
    {
        var (client, _) = await SignedInAsync();
        var first = await CreateWalkAsync(client, ("repeatWeekly", true), ("startsAt", JuneStart));
        var now = JuneStart.AddHours(1);

        var counts = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Task.Run(() => RunSeriesJobAsync(now), Ct)));

        Assert.Equal(1, counts.Sum());
        Assert.Equal(2, (await SeriesWalksAsync(await SeriesIdAsync(first.Id))).Count);
        await WaitForNotificationsAsync();
    }

    [Fact]
    public async Task Each_series_gets_its_own_next_walk()
    {
        var (alice, _) = await SignedInAsync("alice", "Alice");
        var (bob, _) = await SignedInAsync("bob", "Bob");
        await CreateWalkAsync(alice, ("repeatWeekly", true), ("startsAt", JuneStart));
        await CreateWalkAsync(bob, ("repeatWeekly", true), ("startsAt", JuneStart.AddHours(2)));

        Assert.Equal(2, await RunSeriesJobAsync(JuneStart.AddHours(3)));
        Assert.Equal(4, await WithDbAsync(db => db.Walks.CountAsync(Ct)));
    }

    [Fact]
    public async Task Stopping_the_series_prevents_the_next_walk()
    {
        var (client, _) = await SignedInAsync();
        var first = await CreateWalkAsync(client, ("repeatWeekly", true), ("startsAt", JuneStart));

        var response = await StopSeriesAsync(client, first.Id);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False((await response.Content.ReadFromJsonAsync<WalkDetailResponse>(Json, Ct))!.RepeatsWeekly);
        Assert.False((await GetWalkAsync(client, first.Id)).RepeatsWeekly);
        Assert.False(await WithDbAsync(db => db.WalkSeries.Select(s => s.Active).SingleAsync(Ct)));
        Assert.Equal(0, await RunSeriesJobAsync(JuneStart.AddHours(1)));

        // Idempotent.
        Assert.Equal(HttpStatusCode.OK, (await StopSeriesAsync(client, first.Id)).StatusCode);
    }

    [Fact]
    public async Task Any_walk_of_the_series_stops_it_even_after_it_started()
    {
        var (client, _) = await SignedInAsync();
        var first = await CreateWalkAsync(client, ("repeatWeekly", true), ("startsAt", JuneStart));
        await RunSeriesJobAsync(JuneStart.AddMinutes(1));
        await MoveWalkStartAsync(first.Id, DateTimeOffset.UtcNow.AddDays(-1));

        Assert.Equal(HttpStatusCode.OK, (await StopSeriesAsync(client, first.Id)).StatusCode);

        var walks = await SeriesWalksAsync(await SeriesIdAsync(first.Id));
        Assert.All(walks, w => Assert.Equal(WalkStatus.Scheduled, w.Status));
        Assert.False((await GetWalkAsync(client, walks[1].Id)).RepeatsWeekly);
    }

    [Fact]
    public async Task Stopping_a_series_is_checked()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var (other, _) = await SignedInAsync("other", "Other");
        var series = await CreateWalkAsync(organizer, ("repeatWeekly", true));
        var single = await CreateWalkAsync(organizer);

        await AssertProblemAsync(await StopSeriesAsync(other, series.Id), HttpStatusCode.Forbidden, "walk.forbidden");
        await AssertProblemAsync(await StopSeriesAsync(organizer, single.Id), HttpStatusCode.Conflict, "walk.not_in_series");
        await AssertProblemAsync(await StopSeriesAsync(organizer, Guid.NewGuid()), HttpStatusCode.NotFound, "walk.not_found");
        Assert.True(await WithDbAsync(db => db.WalkSeries.Select(s => s.Active).SingleAsync(Ct)));
    }

    [Theory]
    // Clocks go forward on Sunday 30 March 2031: 10:00 stays 10:00, from 09:00 to 08:00 UTC.
    [InlineData("2031-03-29T09:00:00Z", "2031-04-05T08:00:00Z")]
    // Clocks go back on Sunday 26 October 2031: from 08:00 to 09:00 UTC.
    [InlineData("2031-10-25T08:00:00Z", "2031-11-01T09:00:00Z")]
    public async Task The_local_time_is_kept_across_daylight_saving_changes(string start, string expected)
    {
        var (client, _) = await SignedInAsync();
        var startsAt = DateTimeOffset.Parse(start, System.Globalization.CultureInfo.InvariantCulture);
        var first = await CreateWalkAsync(client, ("repeatWeekly", true), ("startsAt", startsAt));

        Assert.Equal(1, await RunSeriesJobAsync(startsAt.AddMinutes(5)));

        var next = (await SeriesWalksAsync(await SeriesIdAsync(first.Id)))[^1];
        Assert.Equal(DateTimeOffset.Parse(expected, System.Globalization.CultureInfo.InvariantCulture), next.StartsAt);
    }
}
