using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Organizations;
using Dogo.Api.Features.Walks;
using Dogo.Api.Tests.Infrastructure;
using Dogo.Api.Tests.Organizations;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Walks;

/// <summary>
/// Writes that do not take the walk lock (cancelling a registration, deleting a dog, leaving an
/// organisation) racing the organizer's decisions and capacity changes (ADR 0037). Each test starts
/// many pairs of requests together and checks an invariant that a blind overwrite would break.
/// </summary>
public sealed class WriteRaceTests(ApiFixture fixture) : OrganizationTestBase(fixture)
{
    private const int Pairs = 10;

    /// <summary>Runs every pair of requests at the same time and returns the responses, pair by pair.</summary>
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

    /// <summary>Owners with one medium dog each, and a pending registration of it on <paramref name="walkId"/>.</summary>
    private async Task<List<(HttpClient Client, Guid DogId, Guid RegistrationId)>> PendingRequestsAsync(Guid walkId)
    {
        var requests = new List<(HttpClient, Guid, Guid)>();
        for (var i = 0; i < Pairs; i++)
        {
            var (client, _, dog) = await DogOwnerAsync($"user{i}");
            var registration = Assert.Single(await RegisterOkAsync(client, walkId, dog.Id));
            Assert.Equal(RegistrationStatus.Pending, registration.Status);
            requests.Add((client, dog.Id, registration.Id));
        }

        return requests;
    }

    private static async Task AssertOneOfAsync(HttpResponseMessage response, params (HttpStatusCode Status, string? Code)[] allowed)
    {
        var body = await response.Content.ReadAsStringAsync(Ct);
        var code = response.Content.Headers.ContentType?.MediaType == "application/problem+json"
            ? System.Text.Json.JsonDocument.Parse(body).RootElement.GetProperty("code").GetString()
            : null;
        Assert.True(allowed.Contains((response.StatusCode, code)), $"Unexpected {(int)response.StatusCode} {code}: {body}");
    }

    [Fact]
    public async Task An_acceptance_never_revives_a_registration_its_author_cancelled()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 50), ("access", "Approval"));
        var requests = await PendingRequestsAsync(walk.Id);

        var results = await RaceAsync(
            requests,
            r => CancelRegistrationAsync(r.Client, walk.Id, r.RegistrationId),
            r => AcceptAsync(organizer, walk.Id, r.RegistrationId));

        foreach (var (cancel, accept) in results)
        {
            Assert.Equal(HttpStatusCode.NoContent, cancel.StatusCode);
            await AssertOneOfAsync(accept, (HttpStatusCode.OK, null), (HttpStatusCode.Conflict, "registration.not_active"));
        }

        // Whatever the order, the author's cancellation is the last word.
        Assert.Equal(Pairs, await WithDbAsync(db => db.Registrations.CountAsync(r => r.Status == RegistrationStatus.Cancelled, Ct)));
        Assert.Equal(0, (await GetWalkAsync(organizer, walk.Id)).AcceptedDogsCount);
    }

    [Fact]
    public async Task A_cancellation_never_overwrites_a_decline_and_a_decline_never_overwrites_a_cancellation()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 50), ("access", "Approval"));
        var requests = await PendingRequestsAsync(walk.Id);

        var results = await RaceAsync(
            requests,
            r => CancelRegistrationAsync(r.Client, walk.Id, r.RegistrationId),
            r => DeclineAsync(organizer, walk.Id, r.RegistrationId));

        var statuses = await WithDbAsync(db => db.Registrations.ToDictionaryAsync(r => r.Id, r => r.Status, Ct));
        foreach (var ((cancel, decline), request) in results.Zip(requests))
        {
            // Exactly one of the two wins, and the stored status is the winner's.
            var cancelled = cancel.StatusCode == HttpStatusCode.NoContent;
            var declined = decline.StatusCode == HttpStatusCode.OK;
            Assert.True(cancelled ^ declined, $"cancel {cancel.StatusCode}, decline {decline.StatusCode}");
            await AssertOneOfAsync(cancelled ? decline : cancel, (HttpStatusCode.Conflict, "registration.not_active"));
            Assert.Equal(cancelled ? RegistrationStatus.Cancelled : RegistrationStatus.Declined, statuses[request.RegistrationId]);
        }
    }

    [Fact]
    public async Task Deleting_a_dog_never_leaves_an_accepted_registration_without_a_dog()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 50), ("access", "Approval"));
        var requests = await PendingRequestsAsync(walk.Id);

        var results = await RaceAsync(
            requests,
            r => r.Client.DeleteAsync($"/api/v1/dogs/{r.DogId}", Ct),
            r => AcceptAsync(organizer, walk.Id, r.RegistrationId));

        foreach (var (delete, accept) in results)
        {
            Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
            await AssertOneOfAsync(accept, (HttpStatusCode.OK, null), (HttpStatusCode.Conflict, "registration.not_active"));
        }

        Assert.Equal(0, await WithDbAsync(db => db.Registrations.CountAsync(
            r => r.Status == RegistrationStatus.Accepted || r.Status == RegistrationStatus.Pending, Ct)));
        Assert.Equal(0, (await GetWalkAsync(organizer, walk.Id)).AcceptedDogsCount);
    }

    [Fact]
    public async Task Deleting_a_dog_never_leaves_a_registration_created_at_the_same_time()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 50));
        var owners = new List<(HttpClient Client, Guid DogId)>();
        for (var i = 0; i < Pairs; i++)
        {
            var (client, _, dog) = await DogOwnerAsync($"user{i}");
            owners.Add((client, dog.Id));
        }

        await Task.WhenAll(owners.Select(o => o.Client.GetAsync($"/api/v1/walks/{walk.Id}", Ct)));
        var results = await RaceAsync(
            owners,
            o => RegisterAsync(o.Client, walk.Id, o.DogId),
            o => o.Client.DeleteAsync($"/api/v1/dogs/{o.DogId}", Ct));

        foreach (var (register, delete) in results)
        {
            Assert.Equal(HttpStatusCode.NoContent, delete.StatusCode);
            await AssertOneOfAsync(register, (HttpStatusCode.Created, null), (HttpStatusCode.NotFound, "dog.not_found"));
        }

        Assert.Equal(0, await WithDbAsync(db => db.Registrations.CountAsync(
            r => r.Status == RegistrationStatus.Accepted || r.Status == RegistrationStatus.Pending, Ct)));
    }

    [Fact]
    public async Task Lowering_the_capacity_while_dogs_register_never_overbooks()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 20));
        var owners = new List<(HttpClient Client, Guid DogId)>();
        for (var i = 0; i < Pairs; i++)
        {
            var (client, _, dog) = await DogOwnerAsync($"user{i}");
            owners.Add((client, dog.Id));
        }

        await organizer.GetAsync($"/api/v1/walks/{walk.Id}", Ct);
        using var start = new SemaphoreSlim(0);
        var registrations = owners.Select(async o =>
        {
            await start.WaitAsync(Ct);
            return await RegisterAsync(o.Client, walk.Id, o.DogId);
        }).ToList();
        var lowerings = Enumerable.Range(0, 3).Select(async _ =>
        {
            await start.WaitAsync(Ct);
            return await organizer.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { maxDogs = 4 }, Ct);
        }).ToList();
        start.Release(owners.Count + lowerings.Count);
        var registered = await Task.WhenAll(registrations);
        var lowered = await Task.WhenAll(lowerings);

        foreach (var response in registered)
        {
            await AssertOneOfAsync(response, (HttpStatusCode.Created, null), (HttpStatusCode.Conflict, "walk.full"));
        }

        foreach (var response in lowered)
        {
            await AssertOneOfAsync(response, (HttpStatusCode.OK, null), (HttpStatusCode.Conflict, "walk.capacity_below_registered"));
        }

        var detail = await GetWalkAsync(organizer, walk.Id);
        Assert.True(detail.AcceptedDogsCount <= detail.MaxDogs, $"{detail.AcceptedDogsCount} accepted for {detail.MaxDogs} places");
        Assert.Equal(lowered.Any(r => r.StatusCode == HttpStatusCode.OK) ? 4 : 20, detail.MaxDogs);
    }

    [Fact]
    public async Task Accepting_a_membership_request_withdrawn_at_the_same_time_answers_cleanly()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var requests = new List<(HttpClient Client, Guid MembershipId)>();
        for (var i = 0; i < Pairs; i++)
        {
            var (client, _) = await SignedInAsync($"user{i}", $"User {i}");
            requests.Add((client, (await RequestMembershipOkAsync(client, organization.Id)).Id));
        }

        var results = await RaceAsync(
            requests,
            r => DeleteMembershipAsync(r.Client, organization.Id, r.MembershipId),
            r => AcceptMembershipAsync(owner, organization.Id, r.MembershipId));

        foreach (var (withdraw, accept) in results)
        {
            Assert.Equal(HttpStatusCode.NoContent, withdraw.StatusCode);
            await AssertOneOfAsync(accept, (HttpStatusCode.OK, null), (HttpStatusCode.NotFound, "membership.not_found"));
        }

        Assert.Equal(1, await WithDbAsync(db => db.Memberships.CountAsync(Ct)));
    }

    [Fact]
    public async Task Removing_a_member_who_leaves_at_the_same_time_answers_cleanly()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var members = new List<(HttpClient Client, Guid MembershipId)>();
        for (var i = 0; i < Pairs; i++)
        {
            var (client, _) = await SignedInAsync($"user{i}", $"User {i}");
            members.Add((client, (await AddMemberAsync(owner, organization.Id, client)).Id));
        }

        var results = await RaceAsync(
            members,
            m => DeleteMembershipAsync(m.Client, organization.Id, m.MembershipId),
            m => DeleteMembershipAsync(owner, organization.Id, m.MembershipId));

        foreach (var (leave, remove) in results)
        {
            Assert.Equal(1, new[] { leave, remove }.Count(r => r.StatusCode == HttpStatusCode.NoContent));
            await AssertOneOfAsync(leave.StatusCode == HttpStatusCode.NoContent ? remove : leave, (HttpStatusCode.NotFound, "membership.not_found"));
        }

        Assert.Equal(1, await WithDbAsync(db => db.Memberships.CountAsync(Ct)));
    }

    [Fact]
    public async Task Promoting_a_member_who_leaves_at_the_same_time_answers_cleanly()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var members = new List<(HttpClient Client, Guid MembershipId)>();
        for (var i = 0; i < Pairs; i++)
        {
            var (client, _) = await SignedInAsync($"user{i}", $"User {i}");
            members.Add((client, (await AddMemberAsync(owner, organization.Id, client)).Id));
        }

        var results = await RaceAsync(
            members,
            m => DeleteMembershipAsync(m.Client, organization.Id, m.MembershipId),
            m => SetRoleAsync(owner, organization.Id, m.MembershipId, "Educator"));

        foreach (var (leave, promote) in results)
        {
            Assert.Equal(HttpStatusCode.NoContent, leave.StatusCode);
            await AssertOneOfAsync(promote, (HttpStatusCode.OK, null), (HttpStatusCode.NotFound, "membership.not_found"));
        }
    }

    [Fact]
    public async Task A_member_who_leaves_while_registering_keeps_no_active_registration()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var walk = await CreateWalkAsync(owner, ("organizationId", organization.Id), ("maxDogs", 50));
        var members = new List<(HttpClient Client, Guid DogId, Guid MembershipId)>();
        for (var i = 0; i < Pairs; i++)
        {
            var (client, _, dog) = await DogOwnerAsync($"user{i}");
            members.Add((client, dog.Id, (await AddMemberAsync(owner, organization.Id, client)).Id));
        }

        await Task.WhenAll(members.Select(m => m.Client.GetAsync($"/api/v1/walks/{walk.Id}", Ct)));
        var results = await RaceAsync(
            members,
            m => RegisterAsync(m.Client, walk.Id, m.DogId),
            m => DeleteMembershipAsync(m.Client, organization.Id, m.MembershipId));

        foreach (var (register, leave) in results)
        {
            Assert.Equal(HttpStatusCode.NoContent, leave.StatusCode);
            await AssertOneOfAsync(register, (HttpStatusCode.Created, null), (HttpStatusCode.Forbidden, "walk.members_only"));
        }

        Assert.Equal(0, await WithDbAsync(db => db.Registrations.CountAsync(
            r => r.Status == RegistrationStatus.Accepted || r.Status == RegistrationStatus.Pending, Ct)));
        Assert.Equal(MembershipRole.Owner, await WithDbAsync(db => db.Memberships.Select(m => m.Role).SingleAsync(Ct)));
    }
}
