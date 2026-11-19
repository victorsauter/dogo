using System.Net;
using Dogo.Api.Tests.Infrastructure;
using Dogo.Api.Tests.Walks;

namespace Dogo.Api.Tests.Admin;

/// <summary>
/// A suspension (ADR 0036) racing the writes it touches: registrations of the suspended account,
/// registrations on its walks, the organizer's acceptances. It takes locks in the order of ADR 0037
/// (user row, then walks); none of these pairs may end in a deadlock, which would surface as a 500.
/// </summary>
public sealed class SuspensionRaceTests(ApiFixture fixture) : WalkTestBase(fixture)
{
    private const int Pairs = 10;

    private static async Task<(HttpResponseMessage First, HttpResponseMessage Second)[]> RaceAsync<T>(
        IEnumerable<T> items, Func<T, Task<HttpResponseMessage>> first, Func<T, Task<HttpResponseMessage>> second)
    {
        using var start = new SemaphoreSlim(0);
        var list = items.ToList();
        var races = list.Select(async item =>
        {
            await start.WaitAsync(Ct);
            var a = first(item);
            var b = second(item);
            return (await a, await b);
        }).ToList();
        start.Release(list.Count);
        return await Task.WhenAll(races);
    }

    private static async Task AssertNeverFailsAsync(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync(Ct);
        Assert.True((int)response.StatusCode < 500, $"{(int)response.StatusCode}: {body}");
    }

    private Task<HttpResponseMessage> SuspendAsync(HttpClient admin, Guid userId) =>
        admin.PostAsync($"/api/v1/admin/users/{userId}/suspend", null, Ct);

    [Fact]
    public async Task Suspending_a_registrant_while_they_register_another_dog_on_the_same_walk_never_fails()
    {
        var (admin, _) = await AdminAsync();
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 50));
        var users = new List<(HttpClient Client, Guid UserId, Guid SecondDogId)>();
        for (var i = 0; i < Pairs; i++)
        {
            var (client, userId, dog) = await DogOwnerAsync($"user{i}");
            var second = await CreateDogOfSizeAsync(client, $"Second of {i}", "Medium");
            await RegisterOkAsync(client, walk.Id, dog.Id);
            users.Add((client, userId, second.Id));
        }

        await Task.WhenAll(users.Select(u => u.Client.GetAsync($"/api/v1/walks/{walk.Id}", Ct)));
        var results = await RaceAsync(
            users,
            u => RegisterAsync(u.Client, walk.Id, u.SecondDogId),
            u => SuspendAsync(admin, u.UserId));

        foreach (var (register, suspend) in results)
        {
            await AssertNeverFailsAsync(register);
            Assert.Equal(HttpStatusCode.OK, suspend.StatusCode);
        }
    }

    [Fact]
    public async Task Suspending_an_organizer_while_they_register_their_own_dog_on_their_walk_never_fails()
    {
        var (admin, _) = await AdminAsync();
        var owners = new List<(HttpClient Client, Guid UserId, Guid DogId, Guid WalkId)>();
        for (var i = 0; i < Pairs; i++)
        {
            var (client, userId, dog) = await DogOwnerAsync($"organizer{i}");
            var walk = await CreateWalkAsync(client, ("maxDogs", 50));
            owners.Add((client, userId, dog.Id, walk.Id));
        }

        await Task.WhenAll(owners.Select(o => o.Client.GetAsync($"/api/v1/walks/{o.WalkId}", Ct)));
        var results = await RaceAsync(
            owners,
            o => RegisterAsync(o.Client, o.WalkId, o.DogId),
            o => SuspendAsync(admin, o.UserId));

        foreach (var (register, suspend) in results)
        {
            await AssertNeverFailsAsync(register);
            Assert.Equal(HttpStatusCode.OK, suspend.StatusCode);
        }
    }

    [Fact]
    public async Task Suspending_an_organizer_while_others_register_and_the_organizer_accepts_never_fails()
    {
        var (admin, _) = await AdminAsync();
        var (organizer, organizerSession) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 50), ("access", "Approval"));
        var pending = new List<(HttpClient Client, Guid DogId, Guid RegistrationId)>();
        for (var i = 0; i < Pairs; i++)
        {
            var (client, _, dog) = await DogOwnerAsync($"user{i}");
            pending.Add((client, dog.Id, Assert.Single(await RegisterOkAsync(client, walk.Id, dog.Id)).Id));
        }

        var newcomers = new List<(HttpClient Client, Guid DogId)>();
        for (var i = 0; i < Pairs; i++)
        {
            var (client, _, dog) = await DogOwnerAsync($"newcomer{i}");
            newcomers.Add((client, dog.Id));
        }

        var accepting = pending.Select(p => AcceptAsync(organizer, walk.Id, p.RegistrationId));
        var registering = newcomers.Select(n => RegisterAsync(n.Client, walk.Id, n.DogId));
        var suspension = SuspendAsync(admin, organizerSession.User.Id);
        var responses = await Task.WhenAll(accepting.Concat(registering).Append(suspension));

        foreach (var response in responses)
        {
            await AssertNeverFailsAsync(response);
        }
    }

    [Fact]
    public async Task Suspending_a_registrant_while_the_organizer_accepts_their_request_never_fails()
    {
        var (admin, _) = await AdminAsync();
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 50), ("access", "Approval"));
        var requests = new List<(Guid UserId, Guid RegistrationId)>();
        for (var i = 0; i < Pairs; i++)
        {
            var (client, userId, dog) = await DogOwnerAsync($"user{i}");
            requests.Add((userId, Assert.Single(await RegisterOkAsync(client, walk.Id, dog.Id)).Id));
        }

        var results = await RaceAsync(
            requests,
            r => AcceptAsync(organizer, walk.Id, r.RegistrationId),
            r => SuspendAsync(admin, r.UserId));

        foreach (var (accept, suspend) in results)
        {
            await AssertNeverFailsAsync(accept);
            Assert.Equal(HttpStatusCode.OK, suspend.StatusCode);
        }
    }
}
