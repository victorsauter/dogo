using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Walks;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Walks;

/// <summary>
/// Simultaneous requests must never exceed a walk's capacity nor give a dog two active
/// registrations (walk row lock + partial unique index).
/// </summary>
public sealed class RegistrationConcurrencyTests(ApiFixture fixture) : WalkTestBase(fixture)
{
    private const int Contenders = 20;

    [Fact]
    public async Task Parallel_registrations_never_exceed_the_capacity()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 5));
        await RegisterOkAsync(organizer, walk.Id, (await CreateDogAsync(organizer, ValidDog("A"))).Id, (await CreateDogAsync(organizer, ValidDog("B"))).Id, (await CreateDogAsync(organizer, ValidDog("C"))).Id);
        var contenders = new List<(HttpClient Client, Guid DogId)>();
        for (var i = 0; i < Contenders; i++)
        {
            var (client, _, dog) = await DogOwnerAsync($"user{i}");
            contenders.Add((client, dog.Id));
        }

        // Warm every client up so that the registrations themselves overlap as much as possible.
        await Task.WhenAll(contenders.Select(c => c.Client.GetAsync($"/api/v1/walks/{walk.Id}", Ct)));

        // All requests start together on a walk with two places left.
        using var start = new SemaphoreSlim(0);
        var requests = contenders.Select(async c =>
        {
            await start.WaitAsync(Ct);
            return await RegisterAsync(c.Client, walk.Id, c.DogId);
        }).ToList();
        start.Release(Contenders);
        var responses = await Task.WhenAll(requests);

        Assert.Equal(2, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        foreach (var refused in responses.Where(r => r.StatusCode != HttpStatusCode.Created))
        {
            await AssertProblemAsync(refused, HttpStatusCode.Conflict, "walk.full");
        }

        Assert.Equal(5, await WithDbAsync(db => db.Registrations.CountAsync(r => r.WalkId == walk.Id && r.Status == RegistrationStatus.Accepted, Ct)));
        Assert.Equal(5, (await GetWalkAsync(organizer, walk.Id)).AcceptedDogsCount);
    }

    [Fact]
    public async Task Parallel_registrations_of_the_same_dog_create_one_registration()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 50));
        var (alice, _, dog) = await DogOwnerAsync("alice");
        await alice.GetAsync($"/api/v1/walks/{walk.Id}", Ct);

        using var start = new SemaphoreSlim(0);
        var requests = Enumerable.Range(0, Contenders).Select(async _ =>
        {
            await start.WaitAsync(Ct);
            return await RegisterAsync(alice, walk.Id, dog.Id);
        }).ToList();
        start.Release(Contenders);
        var responses = await Task.WhenAll(requests);

        Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Created);
        foreach (var refused in responses.Where(r => r.StatusCode != HttpStatusCode.Created))
        {
            await AssertProblemAsync(refused, HttpStatusCode.Conflict, "registration.duplicate");
        }

        Assert.Equal(1, await WithDbAsync(db => db.Registrations.CountAsync(Ct)));
    }

    [Fact]
    public async Task Parallel_acceptances_never_exceed_the_capacity()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 3), ("access", "Approval"));
        var pending = new List<Guid>();
        for (var i = 0; i < 10; i++)
        {
            var (client, _, dog) = await DogOwnerAsync($"user{i}");
            pending.Add(Assert.Single(await RegisterOkAsync(client, walk.Id, dog.Id)).Id);
        }

        await organizer.GetAsync($"/api/v1/walks/{walk.Id}", Ct);
        using var start = new SemaphoreSlim(0);
        var requests = pending.Select(async registrationId =>
        {
            await start.WaitAsync(Ct);
            return await AcceptAsync(organizer, walk.Id, registrationId);
        }).ToList();
        start.Release(pending.Count);
        var responses = await Task.WhenAll(requests);

        Assert.Equal(3, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        foreach (var refused in responses.Where(r => r.StatusCode != HttpStatusCode.OK))
        {
            await AssertProblemAsync(refused, HttpStatusCode.Conflict, "walk.full");
        }

        Assert.Equal(3, await WithDbAsync(db => db.Registrations.CountAsync(r => r.Status == RegistrationStatus.Accepted, Ct)));
    }

    [Fact]
    public async Task The_database_rejects_a_second_active_registration_of_a_dog()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (alice, aliceId, dog) = await DogOwnerAsync("alice");
        await RegisterOkAsync(alice, walk.Id, dog.Id);

        var exception = await Assert.ThrowsAsync<DbUpdateException>(() => WithDbAsync(async db =>
        {
            db.Registrations.Add(new Registration { WalkId = walk.Id, DogId = dog.Id, UserId = aliceId, Status = RegistrationStatus.Pending });
            await db.SaveChangesAsync(Ct);
        }));

        Assert.Contains(Registration.ActiveDogIndexName, exception.InnerException?.Message);
    }
}
