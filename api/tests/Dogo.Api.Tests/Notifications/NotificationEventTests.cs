using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Notifications;
using Dogo.Api.Infrastructure.Push;
using Dogo.Api.Tests.Infrastructure;
using Dogo.Api.Tests.Walks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Dogo.Api.Tests.Notifications;

/// <summary>Each event of spec §4.4 notifies the right people, with their preferences honoured and never the actor.</summary>
public sealed class NotificationEventTests(ApiFixture fixture) : WalkTestBase(fixture)
{
    private sealed record Person(HttpClient Client, Guid Id, Guid DogId);

    private async Task<Person> PersonAsync(string name)
    {
        var (client, id, dog) = await DogOwnerAsync(name);
        await RegisterDeviceAsync(client, name);
        return new Person(client, id, dog.Id);
    }

    private static List<(Guid UserId, string Type)> Summary(IEnumerable<PushMessage> pushes) =>
        pushes.Select(p => (p.UserId, p.Data["type"])).OrderBy(p => p.UserId).ThenBy(p => p.Item2).ToList();

    private static List<(Guid UserId, string Type)> Expected(string type, params Person[] people) =>
        people.Select(p => (p.Id, type)).OrderBy(p => p.Id).ToList();

    private async Task<List<(Guid UserId, string Type)>> SentSinceAsync(int before) =>
        Summary((await SentPushesAsync()).Skip(before));

    private static Task SetPreferencesAsync(Person person, bool registrations = true, bool walkChanges = true, bool messages = true, bool reminders = true) =>
        person.Client.PutAsJsonAsync("/api/v1/me/notification-preferences", new { registrations, walkChanges, messages, reminders }, Ct);

    [Fact]
    public async Task A_registration_notifies_the_organizer_with_the_walk_link()
    {
        var organizer = await PersonAsync("organizer");
        var walk = await CreateWalkAsync(organizer.Client, ("title", "Tour du lac"));
        var alice = await PersonAsync("alice");

        await RegisterOkAsync(alice.Client, walk.Id, alice.DogId);

        var push = Assert.Single(await SentPushesAsync());
        Assert.Equal(organizer.Id, push.UserId);
        Assert.Equal("ExponentPushToken[organizer]", push.Token);
        Assert.Equal("Nouvelle inscription", push.Title);
        Assert.Equal("alice participera à « Tour du lac ».", push.Body);
        Assert.Equal(
            new Dictionary<string, string> { ["type"] = "registration_created", ["walkId"] = walk.Id.ToString(), ["url"] = $"uzu://walks/{walk.Id}" },
            push.Data);
    }

    [Fact]
    public async Task A_request_on_an_approval_walk_notifies_the_organizer()
    {
        var organizer = await PersonAsync("organizer");
        var walk = await CreateWalkAsync(organizer.Client, ("access", "Approval"), ("title", "Tour du lac"));
        var alice = await PersonAsync("alice");

        await RegisterOkAsync(alice.Client, walk.Id, alice.DogId);

        var push = Assert.Single(await SentPushesAsync());
        Assert.Equal((organizer.Id, "registration_requested"), (push.UserId, push.Data["type"]));
        Assert.Equal("Nouvelle demande", push.Title);
        Assert.Equal("alice demande à participer à « Tour du lac ».", push.Body);
    }

    [Fact]
    public async Task Several_dogs_in_one_request_notify_once()
    {
        var organizer = await PersonAsync("organizer");
        var walk = await CreateWalkAsync(organizer.Client);
        var alice = await PersonAsync("alice");
        var second = await CreateDogOfSizeAsync(alice.Client, "Second", "Small");

        await RegisterOkAsync(alice.Client, walk.Id, alice.DogId, second.Id);

        Assert.Equal(Expected("registration_created", organizer), Summary(await SentPushesAsync()));
    }

    [Fact]
    public async Task The_organizer_registering_their_own_dog_is_not_notified()
    {
        var organizer = await PersonAsync("organizer");
        var walk = await CreateWalkAsync(organizer.Client);

        await RegisterOkAsync(organizer.Client, walk.Id, organizer.DogId);

        Assert.Empty(await SentPushesAsync());
    }

    [Fact]
    public async Task Accepting_and_declining_notify_the_author()
    {
        var organizer = await PersonAsync("organizer");
        var walk = await CreateWalkAsync(organizer.Client, ("access", "Approval"), ("title", "Tour du lac"));
        var alice = await PersonAsync("alice");
        var bob = await PersonAsync("bob");
        var aliceRegistration = Assert.Single(await RegisterOkAsync(alice.Client, walk.Id, alice.DogId));
        var bobRegistration = Assert.Single(await RegisterOkAsync(bob.Client, walk.Id, bob.DogId));
        var before = (await SentPushesAsync()).Count;

        Assert.Equal(HttpStatusCode.OK, (await AcceptAsync(organizer.Client, walk.Id, aliceRegistration.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await DeclineAsync(organizer.Client, walk.Id, bobRegistration.Id)).StatusCode);

        var pushes = (await SentPushesAsync()).Skip(before).ToList();
        Assert.Equal(
            [(alice.Id, "registration_accepted", "Inscription acceptée", "Ta participation à « Tour du lac » est confirmée."),
             (bob.Id, "registration_declined", "Inscription refusée", "Ton inscription à « Tour du lac » n'a pas été retenue.")],
            pushes.Select(p => (p.UserId, p.Data["type"], p.Title, p.Body)));
    }

    [Fact]
    public async Task Removing_an_accepted_participant_notifies_them()
    {
        var organizer = await PersonAsync("organizer");
        var walk = await CreateWalkAsync(organizer.Client);
        var alice = await PersonAsync("alice");
        var registration = Assert.Single(await RegisterOkAsync(alice.Client, walk.Id, alice.DogId));
        var before = (await SentPushesAsync()).Count;

        Assert.Equal(HttpStatusCode.OK, (await DeclineAsync(organizer.Client, walk.Id, registration.Id)).StatusCode);

        Assert.Equal(Expected("registration_declined", alice), await SentSinceAsync(before));
    }

    [Fact]
    public async Task Repeated_decisions_do_not_notify_again()
    {
        var organizer = await PersonAsync("organizer");
        var walk = await CreateWalkAsync(organizer.Client, ("access", "Approval"));
        var alice = await PersonAsync("alice");
        var registration = Assert.Single(await RegisterOkAsync(alice.Client, walk.Id, alice.DogId));
        await AcceptAsync(organizer.Client, walk.Id, registration.Id);
        var before = (await SentPushesAsync()).Count;

        Assert.Equal(HttpStatusCode.OK, (await AcceptAsync(organizer.Client, walk.Id, registration.Id)).StatusCode);

        Assert.Empty(await SentSinceAsync(before));
    }

    /// <summary>Organizer (with an accepted dog of their own), accepted, pending and declined participants.</summary>
    private async Task<(Person Organizer, Guid WalkId, Person Accepted, Person Pending, Person Declined)> PopulatedWalkAsync()
    {
        var organizer = await PersonAsync("organizer");
        var walk = await CreateWalkAsync(organizer.Client, ("access", "Approval"), ("title", "Tour du lac"));
        await RegisterOkAsync(organizer.Client, walk.Id, organizer.DogId);
        var accepted = await PersonAsync("accepted");
        var pending = await PersonAsync("pending");
        var declined = await PersonAsync("declined");
        await AcceptAsync(organizer.Client, walk.Id, Assert.Single(await RegisterOkAsync(accepted.Client, walk.Id, accepted.DogId)).Id);
        await RegisterOkAsync(pending.Client, walk.Id, pending.DogId);
        await DeclineAsync(organizer.Client, walk.Id, Assert.Single(await RegisterOkAsync(declined.Client, walk.Id, declined.DogId)).Id);
        await WaitForNotificationsAsync();
        return (organizer, walk.Id, accepted, pending, declined);
    }

    [Fact]
    public async Task A_change_notifies_accepted_and_pending_registrants_but_not_the_organizer()
    {
        var (organizer, walkId, accepted, pending, _) = await PopulatedWalkAsync();
        var before = Pushes.Count;

        var response = await organizer.Client.PatchAsJsonAsync($"/api/v1/walks/{walkId}", new { locationLabel = "Entrée nord" }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(Expected("walk_updated", accepted, pending), await SentSinceAsync(before));
        var push = Pushes[^1];
        Assert.Equal("Balade modifiée", push.Title);
        Assert.StartsWith("« Tour du lac » a changé : prévue le ", push.Body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task An_update_without_actual_change_notifies_no_one()
    {
        var (organizer, walkId, _, _, _) = await PopulatedWalkAsync();
        var walk = await GetWalkAsync(organizer.Client, walkId);
        var before = Pushes.Count;

        var response = await organizer.Client.PatchAsJsonAsync($"/api/v1/walks/{walkId}", new
        {
            title = walk.Title,
            startsAt = walk.StartsAt,
            location = walk.Location,
            allowedSizes = walk.AllowedSizes,
            maxDogs = walk.MaxDogs,
        }, Json, Ct);

        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
        Assert.Empty(await SentSinceAsync(before));
    }

    [Fact]
    public async Task Cancelling_notifies_accepted_and_pending_registrants_once()
    {
        var (organizer, walkId, accepted, pending, _) = await PopulatedWalkAsync();
        var before = Pushes.Count;

        await organizer.Client.PostAsync($"/api/v1/walks/{walkId}/cancel", null, Ct);
        await organizer.Client.PostAsync($"/api/v1/walks/{walkId}/cancel", null, Ct);

        Assert.Equal(Expected("walk_cancelled", accepted, pending), await SentSinceAsync(before));
        Assert.Equal("Balade annulée", Pushes[^1].Title);
    }

    [Fact]
    public async Task A_message_notifies_the_organizer_and_accepted_participants_except_the_author()
    {
        var (organizer, walkId, accepted, _, _) = await PopulatedWalkAsync();
        var other = await PersonAsync("other");
        await RegisterOkAsync(other.Client, walkId, other.DogId);
        await AcceptAsync(organizer.Client, walkId, (await GetWalkAsync(organizer.Client, walkId)).PendingRegistrations.Single(r => r.Owner.Id == other.Id).RegistrationId);
        await WaitForNotificationsAsync();
        var before = Pushes.Count;

        await accepted.Client.PostAsJsonAsync($"/api/v1/walks/{walkId}/messages", new { text = "On se retrouve à l'entrée ?" }, Ct);

        Assert.Equal(Expected("message_posted", organizer, other), await SentSinceAsync(before));
        var push = Pushes[^1];
        Assert.Equal("Tour du lac", push.Title);
        Assert.Equal("accepted : On se retrouve à l'entrée ?", push.Body);
    }

    [Fact]
    public async Task A_long_message_is_shortened_in_the_notification()
    {
        var (organizer, walkId, accepted, _, _) = await PopulatedWalkAsync();
        var before = Pushes.Count;

        await organizer.Client.PostAsJsonAsync($"/api/v1/walks/{walkId}/messages", new { text = new string('a', 500) }, Ct);

        var push = Assert.Single((await SentPushesAsync()).Skip(before));
        Assert.Equal(accepted.Id, push.UserId);
        Assert.EndsWith("…", push.Body, StringComparison.Ordinal);
        Assert.True(push.Body.Length < 150);
    }

    [Fact]
    public async Task The_registrations_preference_is_honoured()
    {
        var organizer = await PersonAsync("organizer");
        await SetPreferencesAsync(organizer, registrations: false);
        var walk = await CreateWalkAsync(organizer.Client);
        var alice = await PersonAsync("alice");

        await RegisterOkAsync(alice.Client, walk.Id, alice.DogId);
        await organizer.Client.PostAsJsonAsync($"/api/v1/walks/{walk.Id}/messages", new { text = "Bienvenue" }, Ct);
        await alice.Client.PostAsJsonAsync($"/api/v1/walks/{walk.Id}/messages", new { text = "Merci" }, Ct);

        // Only the messages get through to the organizer.
        Assert.Equal(
            [.. Expected("message_posted", organizer, alice)],
            Summary(await SentPushesAsync()));
    }

    [Fact]
    public async Task The_walk_changes_preference_is_honoured()
    {
        var (organizer, walkId, accepted, pending, _) = await PopulatedWalkAsync();
        await SetPreferencesAsync(accepted, walkChanges: false);
        var before = Pushes.Count;

        await organizer.Client.PatchAsJsonAsync($"/api/v1/walks/{walkId}", new { title = "Nouveau titre" }, Ct);
        await organizer.Client.PostAsync($"/api/v1/walks/{walkId}/cancel", null, Ct);

        Assert.Equal([.. Expected("walk_cancelled", pending), .. Expected("walk_updated", pending)], await SentSinceAsync(before));
    }

    [Fact]
    public async Task The_messages_preference_is_honoured()
    {
        var (organizer, walkId, accepted, _, _) = await PopulatedWalkAsync();
        await SetPreferencesAsync(organizer, messages: false);
        var before = Pushes.Count;

        await accepted.Client.PostAsJsonAsync($"/api/v1/walks/{walkId}/messages", new { text = "Coucou" }, Ct);

        Assert.Empty(await SentSinceAsync(before));
    }

    [Fact]
    public async Task Every_device_of_a_recipient_is_notified_and_users_without_device_are_skipped()
    {
        var organizer = await PersonAsync("organizer");
        await RegisterDeviceAsync(organizer.Client, "organizer-tablet", "Android");
        var walk = await CreateWalkAsync(organizer.Client);
        var (silent, _, silentDog) = await DogOwnerAsync("silent");
        var alice = await PersonAsync("alice");
        await RegisterOkAsync(silent, walk.Id, silentDog.Id);
        await RegisterOkAsync(alice.Client, walk.Id, alice.DogId);
        var before = (await SentPushesAsync()).Count;

        await organizer.Client.PostAsync($"/api/v1/walks/{walk.Id}/cancel", null, Ct);

        var pushes = (await SentPushesAsync()).Skip(before).ToList();
        Assert.Equal(["ExponentPushToken[alice]"], pushes.Select(p => p.Token));
        Assert.Equal(4, before);
        Assert.Equal(
            ["ExponentPushToken[organizer-tablet]", "ExponentPushToken[organizer]"],
            Pushes.Take(2).Select(p => p.Token).Order());
    }

    [Fact]
    public async Task A_device_reported_as_unregistered_is_removed()
    {
        var organizer = await PersonAsync("organizer");
        var stale = await RegisterDeviceAsync(organizer.Client, "stale");
        Factory.PushSender.Unregistered[stale] = true;
        var walk = await CreateWalkAsync(organizer.Client);
        var alice = await PersonAsync("alice");

        await RegisterOkAsync(alice.Client, walk.Id, alice.DogId);
        await WaitForNotificationsAsync();

        var tokens = await WithDbAsync(db => db.Devices.Where(d => d.UserId == organizer.Id).Select(d => d.ExpoPushToken).ToListAsync(Ct));
        Assert.Equal(["ExponentPushToken[organizer]"], tokens);
    }

    [Fact]
    public async Task The_service_drops_the_actor_and_duplicates()
    {
        var organizer = await PersonAsync("organizer");
        var alice = await PersonAsync("alice");
        var walk = await CreateWalkAsync(organizer.Client);
        var subject = new NotificationSubject("walkId", walk.Id, $"walks/{walk.Id}", walk.Title, walk.StartsAt);

        await using var scope = Factory.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<NotificationService>().DeliverAsync(
            new NotificationRequest(NotificationType.WalkUpdated, subject, organizer.Id, [alice.Id, organizer.Id, alice.Id]), Ct);

        Assert.Equal(Expected("walk_updated", alice), Summary(Pushes));
    }

    [Fact]
    public async Task A_failing_delivery_does_not_fail_the_request_nor_stop_the_dispatcher()
    {
        var organizer = await PersonAsync("organizer");
        var walk = await CreateWalkAsync(organizer.Client);
        var alice = await PersonAsync("alice");
        await WithDbAsync(db => db.Database.ExecuteSqlRawAsync("ALTER TABLE devices RENAME TO devices_broken", Ct));
        try
        {
            await RegisterOkAsync(alice.Client, walk.Id, alice.DogId);
            await WaitForNotificationsAsync();
        }
        finally
        {
            await WithDbAsync(db => db.Database.ExecuteSqlRawAsync("ALTER TABLE devices_broken RENAME TO devices", Ct));
        }

        Assert.Empty(Pushes);
        await organizer.Client.PostAsJsonAsync($"/api/v1/walks/{walk.Id}/messages", new { text = "Bienvenue" }, Ct);
        Assert.Equal(Expected("message_posted", alice), Summary(await SentPushesAsync()));
    }

    [Fact]
    public void Every_notification_type_has_its_texts_and_preference()
    {
        Assert.Empty(NotificationTexts.Missing);
        Assert.Equal("series_walk_created", NotificationType.SeriesWalkCreated.WireName());
    }
}
