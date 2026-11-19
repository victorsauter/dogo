using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Dogs;
using Dogo.Api.Features.Walks;
using Dogo.Api.Tests.Infrastructure;
using Dogo.Api.Tests.Walks;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Dogs;

/// <summary>A dog cannot take a size that an upcoming walk it is registered to does not allow (409 <c>dog.size_in_use</c>).</summary>
public sealed class DogSizeTests(ApiFixture fixture) : WalkTestBase(fixture)
{
    private static Task<HttpResponseMessage> ResizeAsync(HttpClient client, Guid dogId, string size) =>
        client.PatchAsJsonAsync($"/api/v1/dogs/{dogId}", new { size }, Ct);

    private Task<DogSize> StoredSizeAsync(Guid dogId) =>
        WithDbAsync(db => db.Dogs.Where(d => d.Id == dogId).Select(d => d.Size).SingleAsync(Ct));

    [Theory]
    [InlineData("Open")]
    [InlineData("Approval")]
    public async Task A_registered_dog_cannot_grow_out_of_its_walk(string access)
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("allowedSizes", new[] { "Small" }), ("access", access));
        var (alice, _, dog) = await DogOwnerAsync("alice", "Small");
        await RegisterOkAsync(alice, walk.Id, dog.Id);

        await AssertProblemAsync(await ResizeAsync(alice, dog.Id, "Large"), HttpStatusCode.Conflict, "dog.size_in_use");

        Assert.Equal(DogSize.Small, await StoredSizeAsync(dog.Id));
    }

    [Fact]
    public async Task A_registered_dog_cannot_shrink_out_of_its_walk_either()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("allowedSizes", new[] { "Large" }));
        var (alice, _, dog) = await DogOwnerAsync("alice", "Large");
        await RegisterOkAsync(alice, walk.Id, dog.Id);

        await AssertProblemAsync(await ResizeAsync(alice, dog.Id, "Small"), HttpStatusCode.Conflict, "dog.size_in_use");
    }

    [Fact]
    public async Task A_size_still_allowed_by_every_walk_is_accepted()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("allowedSizes", new[] { "Small", "Medium" }));
        var (alice, _, dog) = await DogOwnerAsync("alice", "Small");
        await RegisterOkAsync(alice, walk.Id, dog.Id);

        var response = await ResizeAsync(alice, dog.Id, "Medium");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(DogSize.Medium, await StoredSizeAsync(dog.Id));
    }

    [Fact]
    public async Task Past_cancelled_and_declined_registrations_and_cancelled_walks_do_not_count()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var (alice, _, dog) = await DogOwnerAsync("alice", "Small");
        var past = await CreateWalkAsync(organizer, ("allowedSizes", new[] { "Small" }));
        var cancelledRegistration = await CreateWalkAsync(organizer, ("allowedSizes", new[] { "Small" }));
        var declined = await CreateWalkAsync(organizer, ("allowedSizes", new[] { "Small" }));
        var cancelledWalk = await CreateWalkAsync(organizer, ("allowedSizes", new[] { "Small" }));
        await RegisterOkAsync(alice, past.Id, dog.Id);
        var toCancel = Assert.Single(await RegisterOkAsync(alice, cancelledRegistration.Id, dog.Id));
        var toDecline = Assert.Single(await RegisterOkAsync(alice, declined.Id, dog.Id));
        await RegisterOkAsync(alice, cancelledWalk.Id, dog.Id);
        Assert.Equal(HttpStatusCode.NoContent, (await CancelRegistrationAsync(alice, cancelledRegistration.Id, toCancel.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await DeclineAsync(organizer, declined.Id, toDecline.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await organizer.PostAsync($"/api/v1/walks/{cancelledWalk.Id}/cancel", null, Ct)).StatusCode);
        await MoveWalkStartAsync(past.Id, DateTimeOffset.UtcNow.AddHours(-1));

        var response = await ResizeAsync(alice, dog.Id, "Large");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(DogSize.Large, await StoredSizeAsync(dog.Id));
    }

    [Fact]
    public async Task Other_fields_and_the_same_size_can_be_sent_while_registered()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("allowedSizes", new[] { "Small" }));
        var (alice, _, dog) = await DogOwnerAsync("alice", "Small");
        await RegisterOkAsync(alice, walk.Id, dog.Id);

        var response = await alice.PatchAsJsonAsync($"/api/v1/dogs/{dog.Id}", new { name = "Filou", size = "Small" }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task A_resize_racing_a_registration_never_leaves_a_dog_of_a_refused_size()
    {
        const int Pairs = 10;
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("allowedSizes", new[] { "Small" }), ("maxDogs", 50));
        var owners = new List<(HttpClient Client, Guid DogId)>();
        for (var i = 0; i < Pairs; i++)
        {
            var (client, _, dog) = await DogOwnerAsync($"user{i}", "Small");
            owners.Add((client, dog.Id));
        }

        await Task.WhenAll(owners.Select(o => o.Client.GetAsync($"/api/v1/walks/{walk.Id}", Ct)));
        using var start = new SemaphoreSlim(0);
        var races = owners.Select(async o =>
        {
            await start.WaitAsync(Ct);
            var register = RegisterAsync(o.Client, walk.Id, o.DogId);
            var resize = ResizeAsync(o.Client, o.DogId, "Large");
            return (Register: await register, Resize: await resize);
        }).ToList();
        start.Release(Pairs);
        var results = await Task.WhenAll(races);

        foreach (var (register, resize) in results)
        {
            // Exactly one of the two wins; the other gets its business error.
            Assert.True(
                (register.StatusCode == HttpStatusCode.Created) ^ (resize.StatusCode == HttpStatusCode.OK),
                $"register {register.StatusCode}, resize {resize.StatusCode}");
        }

        var activeOfRefusedSize = await WithDbAsync(db => db.Registrations.CountAsync(
            r => r.WalkId == walk.Id && r.Status == RegistrationStatus.Accepted && r.Dog!.Size != DogSize.Small, Ct));
        Assert.Equal(0, activeOfRefusedSize);
    }
}
