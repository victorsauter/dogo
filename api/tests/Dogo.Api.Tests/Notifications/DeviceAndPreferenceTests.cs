using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Notifications;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Notifications;

public sealed class DeviceAndPreferenceTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private const string Token = "ExponentPushToken[abc123]";

    private static Task<HttpResponseMessage> PutDeviceAsync(HttpClient client, object body) =>
        client.PutAsJsonAsync("/api/v1/me/devices", body, Ct);

    [Fact]
    public async Task Registering_a_device_stores_it()
    {
        var (client, session) = await SignedInAsync();

        var response = await PutDeviceAsync(client, new { expoPushToken = Token, platform = "Ios" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var device = (await response.Content.ReadFromJsonAsync<DeviceResponse>(Json, Ct))!;
        Assert.Equal(Token, device.ExpoPushToken);
        Assert.Equal(DevicePlatform.Ios, device.Platform);
        var stored = Assert.Single(await WithDbAsync(db => db.Devices.ToListAsync(Ct)));
        Assert.Equal(session.User.Id, stored.UserId);
        Assert.Equal(Token, stored.ExpoPushToken);
        Assert.Equal(device.UpdatedAt, stored.UpdatedAt);
    }

    [Fact]
    public async Task Registering_the_same_token_again_updates_it()
    {
        var (client, _) = await SignedInAsync();
        await PutDeviceAsync(client, new { expoPushToken = Token, platform = "Ios" });

        var response = await PutDeviceAsync(client, new { expoPushToken = Token, platform = "Android" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var stored = Assert.Single(await WithDbAsync(db => db.Devices.ToListAsync(Ct)));
        Assert.Equal(DevicePlatform.Android, stored.Platform);
    }

    [Fact]
    public async Task A_user_may_have_several_devices()
    {
        var (client, _) = await SignedInAsync();

        await RegisterDeviceAsync(client, "phone");
        await RegisterDeviceAsync(client, "tablet", "Android");

        Assert.Equal(2, await WithDbAsync(db => db.Devices.CountAsync(Ct)));
    }

    [Fact]
    public async Task A_token_registered_by_another_user_moves_to_them()
    {
        var (alice, _) = await SignedInAsync("alice", "Alice");
        var (bob, bobSession) = await SignedInAsync("bob", "Bob");
        await PutDeviceAsync(alice, new { expoPushToken = Token, platform = "Ios" });

        await PutDeviceAsync(bob, new { expoPushToken = Token, platform = "Ios" });

        var stored = Assert.Single(await WithDbAsync(db => db.Devices.ToListAsync(Ct)));
        Assert.Equal(bobSession.User.Id, stored.UserId);
    }

    [Fact]
    public async Task Concurrent_registrations_of_a_token_keep_one_device()
    {
        var (alice, _) = await SignedInAsync("alice", "Alice");
        var (bob, _) = await SignedInAsync("bob", "Bob");

        var responses = await Task.WhenAll(Enumerable.Range(0, 10).Select(i =>
            PutDeviceAsync(i % 2 == 0 ? alice : bob, new { expoPushToken = Token, platform = "Android" })));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        Assert.Equal(1, await WithDbAsync(db => db.Devices.CountAsync(Ct)));
    }

    [Fact]
    public async Task Deleting_a_device_is_idempotent_and_limited_to_ones_own()
    {
        var (alice, _) = await SignedInAsync("alice", "Alice");
        var (bob, _) = await SignedInAsync("bob", "Bob");
        await PutDeviceAsync(alice, new { expoPushToken = Token, platform = "Ios" });
        var path = $"/api/v1/me/devices/{Uri.EscapeDataString(Token)}";

        Assert.Equal(HttpStatusCode.NoContent, (await bob.DeleteAsync(path, Ct)).StatusCode);
        Assert.Equal(1, await WithDbAsync(db => db.Devices.CountAsync(Ct)));

        Assert.Equal(HttpStatusCode.NoContent, (await alice.DeleteAsync(path, Ct)).StatusCode);
        Assert.Equal(0, await WithDbAsync(db => db.Devices.CountAsync(Ct)));
        Assert.Equal(HttpStatusCode.NoContent, (await alice.DeleteAsync(path, Ct)).StatusCode);
    }

    [Fact]
    public async Task Device_registration_is_validated()
    {
        var (client, _) = await SignedInAsync();

        await AssertValidationProblemAsync(await PutDeviceAsync(client, new { expoPushToken = "", platform = "Ios" }), "expoPushToken");
        await AssertValidationProblemAsync(await PutDeviceAsync(client, new { expoPushToken = new string('x', 256), platform = "Ios" }), "expoPushToken");
        await AssertValidationProblemAsync(await PutDeviceAsync(client, new { expoPushToken = Token, platform = "Windows" }), "platform");
        await AssertValidationProblemAsync(await PutDeviceAsync(client, new { platform = "Ios" }), "expoPushToken");
        Assert.Equal(0, await WithDbAsync(db => db.Devices.CountAsync(Ct)));
    }

    [Fact]
    public async Task Devices_require_authentication()
    {
        var response = await PutDeviceAsync(CreateClient(), new { expoPushToken = Token, platform = "Ios" });

        await AssertProblemAsync(response, HttpStatusCode.Unauthorized, "auth.unauthenticated");
    }

    [Fact]
    public async Task Preferences_are_all_on_by_default_without_a_row()
    {
        var (client, _) = await SignedInAsync();

        var preferences = await client.GetFromJsonAsync<NotificationPreferencesResponse>("/api/v1/me/notification-preferences", Json, Ct);

        Assert.Equal(new NotificationPreferencesResponse(true, true, true, true), preferences);
        Assert.Equal(0, await WithDbAsync(db => db.NotificationPreferences.CountAsync(Ct)));
    }

    [Fact]
    public async Task Preferences_are_replaced()
    {
        var (client, _) = await SignedInAsync();
        var (other, _) = await SignedInAsync("bob", "Bob");

        var response = await client.PutAsJsonAsync("/api/v1/me/notification-preferences",
            new { registrations = false, walkChanges = true, messages = false, reminders = true }, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(new NotificationPreferencesResponse(false, true, false, true), await response.Content.ReadFromJsonAsync<NotificationPreferencesResponse>(Json, Ct));

        await client.PutAsJsonAsync("/api/v1/me/notification-preferences",
            new { registrations = true, walkChanges = false, messages = false, reminders = false }, Ct);

        Assert.Equal(
            new NotificationPreferencesResponse(true, false, false, false),
            await client.GetFromJsonAsync<NotificationPreferencesResponse>("/api/v1/me/notification-preferences", Json, Ct));
        Assert.Equal(
            new NotificationPreferencesResponse(true, true, true, true),
            await other.GetFromJsonAsync<NotificationPreferencesResponse>("/api/v1/me/notification-preferences", Json, Ct));
        Assert.Equal(1, await WithDbAsync(db => db.NotificationPreferences.CountAsync(Ct)));
    }

    [Fact]
    public async Task Preferences_need_all_four_values()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PutAsJsonAsync("/api/v1/me/notification-preferences", new { registrations = false }, Ct);

        await AssertValidationProblemAsync(response, "walkChanges", "messages", "reminders");
    }
}
