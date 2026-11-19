using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Walks;

/// <summary>Cases of the reminder (spec §4.4) and of weekly series (spec §4.5) that no test covered.</summary>
public sealed class ReminderAndSeriesEdgeTests(ApiFixture fixture) : WalkTestBase(fixture)
{
    private async Task<int> RemindersSentAsync() =>
        (await SentPushesAsync()).Count(p => p.Data.TryGetValue("type", out var type) && type == "walk_reminder");

    [Fact]
    public async Task A_walk_created_less_than_two_hours_ahead_gets_its_reminder_at_the_next_run()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        await RegisterDeviceAsync(organizer, "organizer");
        var startsAt = TruncateToSecond(DateTimeOffset.UtcNow.AddMinutes(45));
        var walk = await CreateWalkAsync(organizer, ("startsAt", startsAt));

        Assert.Equal(1, await RunReminderJobAsync(DateTimeOffset.UtcNow));
        Assert.Equal(0, await RunReminderJobAsync(DateTimeOffset.UtcNow.AddMinutes(1)));

        Assert.Equal(1, await RemindersSentAsync());
        Assert.NotNull(await WithDbAsync(db => db.Walks.Where(w => w.Id == walk.Id).Select(w => w.ReminderSentAt).SingleAsync(Ct)));
    }

    /// <summary>
    /// Observed behaviour, unchanged: moving the start after the reminder was sent makes it due
    /// again, so a second reminder goes out for the new time (here at once, the new start being
    /// less than two hours away). Spec §4.4 says "each reminder is sent once": it is read as once
    /// per start time.
    /// </summary>
    [Fact]
    public async Task Moving_the_start_after_the_reminder_sends_a_second_one_for_the_new_time()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        await RegisterDeviceAsync(organizer, "organizer");
        var walk = await CreateWalkAsync(organizer, ("startsAt", TruncateToSecond(DateTimeOffset.UtcNow.AddMinutes(90))));
        Assert.Equal(1, await RunReminderJobAsync(DateTimeOffset.UtcNow));

        var moved = TruncateToSecond(DateTimeOffset.UtcNow.AddMinutes(60));
        Assert.Equal(HttpStatusCode.OK, (await organizer.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { startsAt = moved }, Ct)).StatusCode);
        Assert.Equal(1, await RunReminderJobAsync(DateTimeOffset.UtcNow));

        Assert.Equal(2, await RemindersSentAsync());
    }

    [Fact]
    public async Task The_next_walk_of_a_series_takes_the_new_local_time_of_the_patched_latest_walk()
    {
        var paris = TimeZoneInfo.FindSystemTimeZoneById("Europe/Paris");
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("repeatWeekly", true));

        // The latest walk moves to 18:30 Paris time, two days later.
        var localDate = TimeZoneInfo.ConvertTime(Tomorrow.AddDays(2), paris).Date;
        var localStart = localDate.AddHours(18).AddMinutes(30);
        var newStart = new DateTimeOffset(localStart, paris.GetUtcOffset(localStart)).ToUniversalTime();
        Assert.Equal(HttpStatusCode.OK, (await organizer.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { startsAt = newStart }, Ct)).StatusCode);

        Assert.Equal(0, await RunSeriesJobAsync(walk.StartsAt.AddMinutes(1)));
        Assert.Equal(1, await RunSeriesJobAsync(newStart.AddMinutes(1)));

        var next = await WithDbAsync(db => db.Walks.AsNoTracking().Where(w => w.Id != walk.Id).SingleAsync(Ct));
        var nextLocal = TimeZoneInfo.ConvertTime(next.StartsAt, paris);
        Assert.Equal(localDate.AddDays(7), nextLocal.Date);
        Assert.Equal(new TimeSpan(18, 30, 0), nextLocal.TimeOfDay);
    }
}
