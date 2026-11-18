using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Dogo.Api.Features.Dogs;
using Dogo.Api.Features.Walks;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Walks;

public sealed class WalkTests(ApiFixture fixture) : WalkTestBase(fixture)
{
    [Fact]
    public async Task Create_walk_returns_201_with_the_walk()
    {
        var (client, session) = await SignedInAsync();

        var response = await client.PostAsJsonAsync("/api/v1/walks", ValidWalk(
            ("title", "  Balade au parc  "),
            ("allowedSizes", new[] { "Large", "Small" })), Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await ReadJsonAsync(response);
        var id = body.GetProperty("id").GetGuid();
        Assert.Equal($"/api/v1/walks/{id}", response.Headers.Location?.OriginalString);
        Assert.Equal("Balade au parc", body.GetProperty("title").GetString());
        Assert.Equal("Tour du lac.", body.GetProperty("description").GetString());
        Assert.Equal(Tomorrow, body.GetProperty("startsAt").GetDateTimeOffset());
        Assert.Equal(90, body.GetProperty("durationMinutes").GetInt32());
        Assert.Equal(ParisLatitude, body.GetProperty("location").GetProperty("latitude").GetDouble(), 9);
        Assert.Equal(ParisLongitude, body.GetProperty("location").GetProperty("longitude").GetDouble(), 9);
        Assert.Equal("Parvis de Notre-Dame", body.GetProperty("locationLabel").GetString());
        Assert.Equal(5, body.GetProperty("maxDogs").GetInt32());
        Assert.Equal(0, body.GetProperty("acceptedDogsCount").GetInt32());
        Assert.Equal(["Small", "Large"], body.GetProperty("allowedSizes").EnumerateArray().Select(s => s.GetString()));
        Assert.Equal("LeashRequired", body.GetProperty("leashRule").GetString());
        Assert.Equal("Ramasser les crottes.", body.GetProperty("rules").GetString());
        Assert.Equal("Open", body.GetProperty("access").GetString());
        Assert.Equal("Scheduled", body.GetProperty("status").GetString());
        Assert.Equal(session.User.Id, body.GetProperty("organizer").GetProperty("id").GetGuid());
        Assert.Equal("Alice", body.GetProperty("organizer").GetProperty("displayName").GetString());
        Assert.True(body.GetProperty("isOrganizer").GetBoolean());
        Assert.Empty(body.GetProperty("participants").EnumerateArray());
        Assert.Empty(body.GetProperty("myRegistrations").EnumerateArray());
        Assert.Empty(body.GetProperty("pendingRegistrations").EnumerateArray());

        // Fields filled by later lots are already in the contract.
        Assert.False(body.GetProperty("isProfessional").GetBoolean());
        Assert.Equal(JsonValueKind.Null, body.GetProperty("organization").ValueKind);
        Assert.False(body.GetProperty("repeatsWeekly").GetBoolean());
        Assert.False(body.GetProperty("hasBlockedParticipant").GetBoolean());
    }

    [Fact]
    public async Task Create_walk_with_only_required_fields_uses_defaults()
    {
        var (client, _) = await SignedInAsync();
        var body = ValidWalk();
        body.Remove("description");
        body.Remove("durationMinutes");
        body.Remove("rules");

        var response = await client.PostAsJsonAsync("/api/v1/walks", body, Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var walk = (await response.Content.ReadFromJsonAsync<WalkDetailResponse>(Json, Ct))!;
        Assert.Equal(60, walk.DurationMinutes);
        Assert.Equal("", walk.Description);
        Assert.Equal("", walk.Rules);
    }

    [Fact]
    public async Task Create_walk_stores_the_location_as_a_geography_point()
    {
        var (client, _) = await SignedInAsync();
        var walk = await CreateWalkAsync(client);

        var stored = await WithDbAsync(db => db.Walks.SingleAsync(w => w.Id == walk.Id, Ct));

        Assert.Equal(4326, stored.Location.SRID);
        Assert.Equal(ParisLongitude, stored.Location.X, 9);
        Assert.Equal(ParisLatitude, stored.Location.Y, 9);
    }

    [Fact]
    public async Task Create_walk_validates_its_fields()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PostAsJsonAsync("/api/v1/walks", ValidWalk(
            ("title", "ab"),
            ("description", new string('d', 2001)),
            ("startsAt", DateTimeOffset.UtcNow.AddMinutes(-1)),
            ("durationMinutes", 14),
            ("locationLabel", new string('l', 121)),
            ("maxDogs", 51),
            ("allowedSizes", Array.Empty<string>()),
            ("rules", new string('r', 1001))), Ct);

        await AssertValidationProblemAsync(response, "title", "description", "startsAt", "durationMinutes", "locationLabel", "maxDogs", "allowedSizes", "rules");
        Assert.Equal(0, await WithDbAsync(db => db.Walks.CountAsync(Ct)));
    }

    [Theory]
    [InlineData(91, 0, "location.latitude")]
    [InlineData(-91, 0, "location.latitude")]
    [InlineData(0, 181, "location.longitude")]
    [InlineData(0, -181, "location.longitude")]
    public async Task Create_walk_validates_the_coordinates(double latitude, double longitude, string field)
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PostAsJsonAsync("/api/v1/walks", ValidWalk(("location", new { latitude, longitude })), Ct);

        await AssertValidationProblemAsync(response, field);
    }

    [Fact]
    public async Task Create_walk_validates_upper_and_lower_bounds()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PostAsJsonAsync("/api/v1/walks", ValidWalk(
            ("title", new string('t', 81)),
            ("durationMinutes", 481),
            ("maxDogs", 0),
            ("locationLabel", "  ")), Ct);

        await AssertValidationProblemAsync(response, "title", "durationMinutes", "maxDogs", "locationLabel");
    }

    [Fact]
    public async Task Create_walk_accepts_the_bounds()
    {
        var (client, _) = await SignedInAsync();

        var walk = await CreateWalkAsync(client,
            ("title", "abc"),
            ("durationMinutes", 15),
            ("maxDogs", 50),
            ("location", new { latitude = 90, longitude = -180 }));

        Assert.Equal("abc", walk.Title);
        Assert.Equal(15, walk.DurationMinutes);
        Assert.Equal(50, walk.MaxDogs);
    }

    [Fact]
    public async Task Create_walk_rejects_duplicate_sizes()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PostAsJsonAsync("/api/v1/walks", ValidWalk(("allowedSizes", new[] { "Small", "Small" })), Ct);

        await AssertValidationProblemAsync(response, "allowedSizes");
    }

    [Fact]
    public async Task Create_walk_requires_its_mandatory_fields()
    {
        var (client, _) = await SignedInAsync();
        var body = ValidWalk();
        body.Remove("location");
        body.Remove("maxDogs");

        var response = await client.PostAsJsonAsync("/api/v1/walks", body, Ct);

        await AssertValidationProblemAsync(response, "location", "maxDogs");
    }

    [Fact]
    public async Task Create_walk_requires_authentication()
    {
        var response = await CreateClient().PostAsJsonAsync("/api/v1/walks", ValidWalk(), Ct);

        await AssertProblemAsync(response, HttpStatusCode.Unauthorized, "auth.unauthenticated");
    }

    [Fact]
    public async Task Any_user_can_read_a_walk_with_the_exact_meeting_point()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (other, _) = await SignedInAsync("other", "Other");

        var seen = await GetWalkAsync(other, walk.Id);

        Assert.False(seen.IsOrganizer);
        Assert.Equal(walk.Title, seen.Title);
        Assert.Equal(walk.StartsAt, seen.StartsAt);
        Assert.Equal(walk.Location, seen.Location);
        Assert.Equal(walk.LocationLabel, seen.LocationLabel);
        Assert.Equal(walk.Organizer, seen.Organizer);
        Assert.Equal(walk.AllowedSizes, seen.AllowedSizes);
        Assert.Equal(walk.CreatedAt, seen.CreatedAt);
    }

    [Fact]
    public async Task Unknown_walk_returns_404()
    {
        var (client, _) = await SignedInAsync();

        await AssertProblemAsync(await client.GetAsync($"/api/v1/walks/{Guid.NewGuid()}", Ct), HttpStatusCode.NotFound, "walk.not_found");
    }

    [Fact]
    public async Task Cancelled_and_past_walks_stay_readable()
    {
        var (client, _) = await SignedInAsync();
        var cancelled = await CreateWalkAsync(client);
        await client.PostAsync($"/api/v1/walks/{cancelled.Id}/cancel", null, Ct);
        var past = await CreateWalkAsync(client);
        await MoveWalkStartAsync(past.Id, DateTimeOffset.UtcNow.AddDays(-3));

        Assert.Equal(WalkStatus.Cancelled, (await GetWalkAsync(client, cancelled.Id)).Status);
        Assert.Equal(WalkStatus.Scheduled, (await GetWalkAsync(client, past.Id)).Status);
    }

    [Fact]
    public async Task Organizer_updates_only_the_given_fields()
    {
        var (client, _) = await SignedInAsync();
        var walk = await CreateWalkAsync(client);
        var newStart = Tomorrow.AddDays(2);

        var response = await client.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new
        {
            title = "  Nouvelle balade ",
            startsAt = newStart,
            durationMinutes = 120,
            location = new { latitude = 45.75, longitude = 4.85 },
            locationLabel = "Parc de la Tête d'Or",
            maxDogs = 8,
            allowedSizes = new[] { "Small" },
            leashRule = "OffLeashAllowed",
            access = "Approval",
        }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = (await response.Content.ReadFromJsonAsync<WalkDetailResponse>(Json, Ct))!;
        Assert.Equal("Nouvelle balade", updated.Title);
        Assert.Equal(newStart, updated.StartsAt);
        Assert.Equal(120, updated.DurationMinutes);
        Assert.Equal(45.75, updated.Location.Latitude, 9);
        Assert.Equal(4.85, updated.Location.Longitude, 9);
        Assert.Equal("Parc de la Tête d'Or", updated.LocationLabel);
        Assert.Equal(8, updated.MaxDogs);
        Assert.Equal([DogSize.Small], updated.AllowedSizes);
        Assert.Equal(LeashRule.OffLeashAllowed, updated.LeashRule);
        Assert.Equal(WalkAccess.Approval, updated.Access);
        Assert.Equal(walk.Description, updated.Description);
        Assert.Equal(walk.Rules, updated.Rules);
        Assert.Equal(walk.CreatedAt, updated.CreatedAt);

        var reread = await GetWalkAsync(client, walk.Id);
        Assert.Equal(updated.Title, reread.Title);
        Assert.Equal(updated.StartsAt, reread.StartsAt);
        Assert.Equal(updated.Location, reread.Location);
        Assert.Equal(updated.AllowedSizes, reread.AllowedSizes);
        Assert.Equal(updated.Access, reread.Access);
    }

    [Fact]
    public async Task Update_with_null_keeps_fields_and_empty_string_clears_description_and_rules()
    {
        var (client, _) = await SignedInAsync();
        var walk = await CreateWalkAsync(client);

        var response = await client.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new
        {
            title = (string?)null,
            maxDogs = (int?)null,
            allowedSizes = (string[]?)null,
            description = "",
            rules = "",
        }, Ct);

        var updated = (await response.Content.ReadFromJsonAsync<WalkDetailResponse>(Json, Ct))!;
        Assert.Equal(walk.Title, updated.Title);
        Assert.Equal(walk.MaxDogs, updated.MaxDogs);
        Assert.Equal(walk.AllowedSizes, updated.AllowedSizes);
        Assert.Equal("", updated.Description);
        Assert.Equal("", updated.Rules);
    }

    [Fact]
    public async Task Update_validates_its_fields()
    {
        var (client, _) = await SignedInAsync();
        var walk = await CreateWalkAsync(client);

        var response = await client.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new
        {
            title = "  ",
            startsAt = DateTimeOffset.UtcNow.AddHours(-1),
            durationMinutes = 500,
            maxDogs = 0,
            allowedSizes = new[] { "Small", "Small" },
            location = new { latitude = 100, longitude = 0 },
        }, Ct);

        await AssertValidationProblemAsync(response, "title", "startsAt", "durationMinutes", "maxDogs", "allowedSizes", "location.latitude");
    }

    [Fact]
    public async Task Update_rejects_an_empty_size_list()
    {
        var (client, _) = await SignedInAsync();
        var walk = await CreateWalkAsync(client);

        var response = await client.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { allowedSizes = Array.Empty<string>() }, Ct);

        await AssertValidationProblemAsync(response, "allowedSizes");
    }

    [Fact]
    public async Task Only_the_organizer_can_update_or_cancel_a_walk()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (other, _) = await SignedInAsync("other", "Other");

        await AssertProblemAsync(await other.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { title = "Volée" }, Ct), HttpStatusCode.Forbidden, "walk.forbidden");
        await AssertProblemAsync(await other.PostAsync($"/api/v1/walks/{walk.Id}/cancel", null, Ct), HttpStatusCode.Forbidden, "walk.forbidden");

        var unchanged = await GetWalkAsync(organizer, walk.Id);
        Assert.Equal(walk.Title, unchanged.Title);
        Assert.Equal(WalkStatus.Scheduled, unchanged.Status);
    }

    [Fact]
    public async Task Updating_or_cancelling_an_unknown_walk_returns_404()
    {
        var (client, _) = await SignedInAsync();

        await AssertProblemAsync(await client.PatchAsJsonAsync($"/api/v1/walks/{Guid.NewGuid()}", new { title = "Fantôme" }, Ct), HttpStatusCode.NotFound, "walk.not_found");
        await AssertProblemAsync(await client.PostAsync($"/api/v1/walks/{Guid.NewGuid()}/cancel", null, Ct), HttpStatusCode.NotFound, "walk.not_found");
    }

    [Fact]
    public async Task A_started_walk_cannot_be_updated_or_cancelled()
    {
        var (client, _) = await SignedInAsync();
        var walk = await CreateWalkAsync(client);
        await MoveWalkStartAsync(walk.Id, DateTimeOffset.UtcNow.AddMinutes(-1));

        await AssertProblemAsync(await client.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { title = "Trop tard" }, Ct), HttpStatusCode.Conflict, "walk.not_open");
        await AssertProblemAsync(await client.PostAsync($"/api/v1/walks/{walk.Id}/cancel", null, Ct), HttpStatusCode.Conflict, "walk.not_open");
        Assert.Equal(WalkStatus.Scheduled, (await GetWalkAsync(client, walk.Id)).Status);
    }

    [Fact]
    public async Task A_cancelled_walk_cannot_be_updated()
    {
        var (client, _) = await SignedInAsync();
        var walk = await CreateWalkAsync(client);
        await client.PostAsync($"/api/v1/walks/{walk.Id}/cancel", null, Ct);

        var response = await client.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { title = "Ressuscitée" }, Ct);

        await AssertProblemAsync(response, HttpStatusCode.Conflict, "walk.not_open");
    }

    [Fact]
    public async Task Max_dogs_cannot_go_below_the_accepted_dogs()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 5));
        var (alice, _, aliceDog) = await DogOwnerAsync("alice");
        var bobDog = await CreateDogOfSizeAsync(alice, "Second", "Small");
        await RegisterOkAsync(alice, walk.Id, aliceDog.Id, bobDog.Id);

        var tooLow = await organizer.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { maxDogs = 1 }, Ct);
        var exact = await organizer.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { maxDogs = 2 }, Ct);

        await AssertProblemAsync(tooLow, HttpStatusCode.Conflict, "walk.capacity_below_registered");
        Assert.Equal(HttpStatusCode.OK, exact.StatusCode);
        Assert.Equal(2, (await GetWalkAsync(organizer, walk.Id)).MaxDogs);
    }

    [Fact]
    public async Task Pending_registrations_do_not_prevent_lowering_max_dogs()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 5), ("access", "Approval"));
        var (alice, _, aliceDog) = await DogOwnerAsync("alice");
        await RegisterOkAsync(alice, walk.Id, aliceDog.Id);

        var response = await organizer.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { maxDogs = 1 }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task An_allowed_size_used_by_an_accepted_dog_cannot_be_removed()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (alice, _, aliceDog) = await DogOwnerAsync("alice", "Large");
        await RegisterOkAsync(alice, walk.Id, aliceDog.Id);

        var removesLarge = await organizer.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { allowedSizes = new[] { "Small", "Medium" } }, Ct);
        var keepsLarge = await organizer.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { allowedSizes = new[] { "Large" } }, Ct);

        await AssertProblemAsync(removesLarge, HttpStatusCode.Conflict, "walk.size_in_use");
        Assert.Equal(HttpStatusCode.OK, keepsLarge.StatusCode);
        Assert.Equal([DogSize.Large], (await GetWalkAsync(organizer, walk.Id)).AllowedSizes);
    }

    [Fact]
    public async Task A_rejected_update_changes_nothing()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (alice, _, aliceDog) = await DogOwnerAsync("alice", "Large");
        await RegisterOkAsync(alice, walk.Id, aliceDog.Id);

        var response = await organizer.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { title = "Changé", allowedSizes = new[] { "Small" } }, Ct);

        await AssertProblemAsync(response, HttpStatusCode.Conflict, "walk.size_in_use");
        Assert.Equal(walk.Title, (await GetWalkAsync(organizer, walk.Id)).Title);
    }

    [Fact]
    public async Task Cancelled_or_declined_dogs_do_not_block_removing_their_size()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (alice, _, aliceDog) = await DogOwnerAsync("alice", "Large");
        var registration = (await RegisterOkAsync(alice, walk.Id, aliceDog.Id))[0];
        await CancelRegistrationAsync(alice, walk.Id, registration.Id);

        var response = await organizer.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { allowedSizes = new[] { "Small" } }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Organizer_cancels_a_walk_and_registrations_are_left_as_they_are()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (alice, _, aliceDog) = await DogOwnerAsync("alice");
        await RegisterOkAsync(alice, walk.Id, aliceDog.Id);

        var response = await organizer.PostAsync($"/api/v1/walks/{walk.Id}/cancel", null, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var cancelled = (await response.Content.ReadFromJsonAsync<WalkDetailResponse>(Json, Ct))!;
        Assert.Equal(WalkStatus.Cancelled, cancelled.Status);
        Assert.Single(cancelled.Participants);
        Assert.Equal(RegistrationStatus.Accepted, await WithDbAsync(db => db.Registrations.Select(r => r.Status).SingleAsync(Ct)));
    }

    [Fact]
    public async Task Cancelling_twice_is_idempotent()
    {
        var (client, _) = await SignedInAsync();
        var walk = await CreateWalkAsync(client);

        var first = await client.PostAsync($"/api/v1/walks/{walk.Id}/cancel", null, Ct);
        await MoveWalkStartAsync(walk.Id, DateTimeOffset.UtcNow.AddHours(-1));
        var second = await client.PostAsync($"/api/v1/walks/{walk.Id}/cancel", null, Ct);

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(WalkStatus.Cancelled, (await second.Content.ReadFromJsonAsync<WalkDetailResponse>(Json, Ct))!.Status);
    }

    [Fact]
    public async Task Suspended_users_cannot_create_walks()
    {
        var (client, session) = await SignedInAsync();
        await WithDbAsync(db => db.Users.Where(u => u.Id == session.User.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, Features.Users.UserStatus.Suspended), Ct));

        var response = await client.PostAsJsonAsync("/api/v1/walks", ValidWalk(), Ct);

        await AssertProblemAsync(response, HttpStatusCode.Forbidden, "account.suspended");
    }
}
