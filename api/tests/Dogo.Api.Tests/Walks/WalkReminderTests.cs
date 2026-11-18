using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Walks;

/// <summary>Reminder 2 hours before the start, sent at most once (spec §4.4).</summary>
public sealed class WalkReminderTests(ApiFixture fixture) : WalkTestBase(fixture)
{
    /// <summary>A walk tomorrow with an organizer, an accepted and a pending participant, all with a device.</summary>
    private async Task<(Guid WalkId, Guid OrganizerId, Guid AcceptedId, HttpClient Organizer)> WalkWithParticipantsAsync()
    {
        var (organizer, session) = await SignedInAsync("organizer", "organizer");
        await RegisterDeviceAsync(organizer, "organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"), ("title", "Tour du lac"));
        var (accepted, acceptedId, acceptedDog) = await DogOwnerAsync("accepted");
        await RegisterDeviceAsync(accepted, "accepted");
        await AcceptAsync(organizer, walk.Id, Assert.Single(await RegisterOkAsync(accepted, walk.Id, acceptedDog.Id)).Id);
        var (pending, _, pendingDog) = await DogOwnerAsync("pending");
        await RegisterDeviceAsync(pending, "pending");
        await RegisterOkAsync(pending, walk.Id, pendingDog.Id);
        await SentPushesAsync();
        Factory.PushSender.Clear();
        return (walk.Id, session.User.Id, acceptedId, organizer);
    }

    private List<Guid> Reminded() =>
        Pushes.Where(p => p.Data["type"] == "walk_reminder").Select(p => p.UserId).Order().ToList();

    [Fact]
    public async Task The_reminder_goes_to_the_organizer_and_accepted_participants()
    {
        var (walkId, organizerId, acceptedId, _) = await WalkWithParticipantsAsync();

        Assert.Equal(1, await RunReminderJobAsync(Tomorrow.AddHours(-2)));

        await WaitForNotificationsAsync();
        Assert.Equal(new[] { organizerId, acceptedId }.Order(), Reminded());
        var push = Pushes[0];
        Assert.Equal("Balade bientôt", push.Title);
        var paris = TimeZoneInfo.ConvertTime(Tomorrow, TimeZoneInfo.FindSystemTimeZoneById("Europe/Paris"));
        Assert.Equal($"« Tour du lac » commence à {paris:HH:mm}.", push.Body);
        Assert.Equal(walkId.ToString(), push.Data["walkId"]);
        Assert.NotNull(await WithDbAsync(db => db.Walks.Where(w => w.Id == walkId).Select(w => w.ReminderSentAt).SingleAsync(Ct)));
    }

    [Fact]
    public async Task The_reminder_is_sent_only_once()
    {
        await WalkWithParticipantsAsync();

        Assert.Equal(1, await RunReminderJobAsync(Tomorrow.AddHours(-1.5)));
        Assert.Equal(0, await RunReminderJobAsync(Tomorrow.AddHours(-1)));
        Assert.Equal(0, await RunReminderJobAsync(Tomorrow.AddMinutes(-1)));

        await WaitForNotificationsAsync();
        Assert.Equal(2, Reminded().Count);
    }

    [Fact]
    public async Task Concurrent_runs_send_each_reminder_once()
    {
        await WalkWithParticipantsAsync();
        var now = Tomorrow.AddHours(-1);

        var counts = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Task.Run(() => RunReminderJobAsync(now), Ct)));

        Assert.Equal(1, counts.Sum());
        await WaitForNotificationsAsync();
        Assert.Equal(2, Reminded().Count);
    }

    [Fact]
    public async Task No_reminder_before_two_hours()
    {
        await WalkWithParticipantsAsync();

        Assert.Equal(0, await RunReminderJobAsync(Tomorrow.AddHours(-2).AddSeconds(-1)));

        await WaitForNotificationsAsync();
        Assert.Empty(Reminded());
    }

    [Fact]
    public async Task No_reminder_for_a_walk_already_started()
    {
        await WalkWithParticipantsAsync();

        Assert.Equal(0, await RunReminderJobAsync(Tomorrow));
        Assert.Equal(0, await RunReminderJobAsync(Tomorrow.AddMinutes(30)));

        await WaitForNotificationsAsync();
        Assert.Empty(Reminded());
    }

    [Fact]
    public async Task No_reminder_for_a_cancelled_walk()
    {
        var (walkId, _, _, organizer) = await WalkWithParticipantsAsync();
        await organizer.PostAsync($"/api/v1/walks/{walkId}/cancel", null, Ct);

        Assert.Equal(0, await RunReminderJobAsync(Tomorrow.AddHours(-1)));

        await WaitForNotificationsAsync();
        Assert.Empty(Reminded());
    }

    [Fact]
    public async Task The_reminders_preference_is_honoured()
    {
        var (_, organizerId, _, organizer) = await WalkWithParticipantsAsync();
        await organizer.PutAsJsonAsync("/api/v1/me/notification-preferences",
            new { registrations = true, walkChanges = true, messages = true, reminders = false }, Ct);

        await RunReminderJobAsync(Tomorrow.AddHours(-1));

        await WaitForNotificationsAsync();
        Assert.DoesNotContain(organizerId, Reminded());
        Assert.Single(Reminded());
    }

    [Fact]
    public async Task Moving_the_start_makes_the_reminder_due_again()
    {
        var (walkId, _, _, organizer) = await WalkWithParticipantsAsync();
        Assert.Equal(1, await RunReminderJobAsync(Tomorrow.AddHours(-1)));
        var later = Tomorrow.AddDays(2);

        var response = await organizer.PatchAsJsonAsync($"/api/v1/walks/{walkId}", new { startsAt = later }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(await WithDbAsync(db => db.Walks.Where(w => w.Id == walkId).Select(w => w.ReminderSentAt).SingleAsync(Ct)));
        Assert.Equal(1, await RunReminderJobAsync(later.AddHours(-1)));
    }

    [Fact]
    public async Task A_change_that_keeps_the_start_keeps_the_reminder_sent()
    {
        var (walkId, _, _, organizer) = await WalkWithParticipantsAsync();
        Assert.Equal(1, await RunReminderJobAsync(Tomorrow.AddHours(-1)));

        await organizer.PatchAsJsonAsync($"/api/v1/walks/{walkId}", new { title = "Autre titre", startsAt = Tomorrow }, Ct);

        Assert.Equal(0, await RunReminderJobAsync(Tomorrow.AddMinutes(-30)));
    }
}
