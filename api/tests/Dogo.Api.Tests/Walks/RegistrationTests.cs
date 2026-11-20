using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Walks;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Walks;

public sealed class RegistrationTests(ApiFixture fixture) : WalkTestBase(fixture)
{
    [Fact]
    public async Task Registering_to_an_open_walk_is_accepted_at_once()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (alice, aliceId, dog) = await DogOwnerAsync("alice");

        var response = await RegisterAsync(alice, walk.Id, dog.Id);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var registration = Assert.Single((await response.Content.ReadFromJsonAsync<List<RegistrationResponse>>(Json, Ct))!);
        Assert.Equal(walk.Id, registration.WalkId);
        Assert.Equal(dog.Id, registration.DogId);
        Assert.Equal(aliceId, registration.UserId);
        Assert.Equal(RegistrationStatus.Accepted, registration.Status);
        Assert.Equal(1, (await GetWalkAsync(alice, walk.Id)).AcceptedDogsCount);
    }

    [Fact]
    public async Task Several_dogs_are_registered_in_one_request()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (alice, _, first) = await DogOwnerAsync("alice");
        var second = await CreateDogOfSizeAsync(alice, "Second", "Small");

        var registrations = await RegisterOkAsync(alice, walk.Id, first.Id, second.Id);

        Assert.Equal([first.Id, second.Id], registrations.Select(r => r.DogId!.Value));
        Assert.All(registrations, r => Assert.Equal(RegistrationStatus.Accepted, r.Status));
        Assert.Equal(2, (await GetWalkAsync(alice, walk.Id)).AcceptedDogsCount);
    }

    [Fact]
    public async Task Registering_to_an_approval_walk_is_pending()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"));
        var (alice, _, dog) = await DogOwnerAsync("alice");

        var registration = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));

        Assert.Equal(RegistrationStatus.Pending, registration.Status);
        Assert.Equal(0, (await GetWalkAsync(alice, walk.Id)).AcceptedDogsCount);
    }

    [Fact]
    public async Task The_organizers_own_dogs_are_accepted_even_on_an_approval_walk()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"), ("maxDogs", 1));
        var dog = await CreateDogAsync(organizer);

        var registration = Assert.Single(await RegisterOkAsync(organizer, walk.Id, dog.Id));

        Assert.Equal(RegistrationStatus.Accepted, registration.Status);
        Assert.Equal(1, (await GetWalkAsync(organizer, walk.Id)).AcceptedDogsCount);

        // ...and they take a place.
        var (alice, _, aliceDog) = await DogOwnerAsync("alice");
        await AssertProblemAsync(await RegisterAsync(alice, walk.Id, aliceDog.Id), HttpStatusCode.Conflict, "walk.full");
    }

    [Fact]
    public async Task Registration_validates_the_dog_list()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var dogId = Guid.NewGuid();

        await AssertValidationProblemAsync(await RegisterAsync(organizer, walk.Id), "dogIds");
        await AssertValidationProblemAsync(await RegisterAsync(organizer, walk.Id, dogId, dogId), "dogIds");
        await AssertValidationProblemAsync(await RegisterAsync(organizer, walk.Id, Enumerable.Range(0, 11).Select(_ => Guid.NewGuid()).ToArray()), "dogIds");
        await AssertValidationProblemAsync(await organizer.PostAsJsonAsync($"/api/v1/walks/{walk.Id}/registrations", new { }, Ct), "dogIds");
    }

    [Fact]
    public async Task Registering_to_an_unknown_walk_returns_404()
    {
        var (alice, _, dog) = await DogOwnerAsync("alice");

        await AssertProblemAsync(await RegisterAsync(alice, Guid.NewGuid(), dog.Id), HttpStatusCode.NotFound, "walk.not_found");
    }

    [Fact]
    public async Task Registering_someone_elses_dog_returns_404_and_registers_nothing()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (alice, _, aliceDog) = await DogOwnerAsync("alice");
        var (_, _, bobDog) = await DogOwnerAsync("bob");

        var response = await RegisterAsync(alice, walk.Id, aliceDog.Id, bobDog.Id);

        await AssertProblemAsync(response, HttpStatusCode.NotFound, "dog.not_found");
        Assert.Equal(0, await WithDbAsync(db => db.Registrations.CountAsync(Ct)));
    }

    [Fact]
    public async Task Registering_an_unknown_dog_returns_404()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);

        await AssertProblemAsync(await RegisterAsync(organizer, walk.Id, Guid.NewGuid()), HttpStatusCode.NotFound, "dog.not_found");
    }

    [Fact]
    public async Task Registering_to_a_cancelled_walk_is_refused()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        await organizer.PostAsync($"/api/v1/walks/{walk.Id}/cancel", null, Ct);
        var (alice, _, dog) = await DogOwnerAsync("alice");

        await AssertProblemAsync(await RegisterAsync(alice, walk.Id, dog.Id), HttpStatusCode.Conflict, "walk.not_open");
    }

    [Fact]
    public async Task Registering_to_a_started_walk_is_refused()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        await MoveWalkStartAsync(walk.Id, DateTimeOffset.UtcNow.AddMinutes(-1));
        var (alice, _, dog) = await DogOwnerAsync("alice");

        await AssertProblemAsync(await RegisterAsync(alice, walk.Id, dog.Id), HttpStatusCode.Conflict, "walk.not_open");
    }

    [Fact]
    public async Task A_dog_of_a_size_not_allowed_is_refused_and_nothing_is_registered()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("allowedSizes", new[] { "Small", "Medium" }));
        var (alice, _, medium) = await DogOwnerAsync("alice");
        var large = await CreateDogOfSizeAsync(alice, "Big", "Large");

        var response = await RegisterAsync(alice, walk.Id, medium.Id, large.Id);

        await AssertProblemAsync(response, HttpStatusCode.Conflict, "walk.size_not_allowed");
        Assert.Equal(0, await WithDbAsync(db => db.Registrations.CountAsync(Ct)));
    }

    [Theory]
    [InlineData("Open")]
    [InlineData("Approval")]
    public async Task A_dog_with_an_active_registration_cannot_register_again(string access)
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", access));
        var (alice, _, dog) = await DogOwnerAsync("alice");
        var other = await CreateDogOfSizeAsync(alice, "Other", "Small");
        await RegisterOkAsync(alice, walk.Id, dog.Id);

        var response = await RegisterAsync(alice, walk.Id, other.Id, dog.Id);

        await AssertProblemAsync(response, HttpStatusCode.Conflict, "registration.duplicate");
        Assert.Equal(1, await WithDbAsync(db => db.Registrations.CountAsync(Ct)));
    }

    [Fact]
    public async Task A_cancelled_or_declined_registration_does_not_block_registering_again()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (alice, _, dog) = await DogOwnerAsync("alice");
        var first = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));
        Assert.Equal(HttpStatusCode.NoContent, (await CancelRegistrationAsync(alice, walk.Id, first.Id)).StatusCode);

        var second = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));
        Assert.Equal(HttpStatusCode.OK, (await DeclineAsync(organizer, walk.Id, second.Id)).StatusCode);

        var third = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));
        Assert.Equal(RegistrationStatus.Accepted, third.Status);
        Assert.Equal(3, await WithDbAsync(db => db.Registrations.CountAsync(Ct)));
    }

    [Fact]
    public async Task Registration_is_refused_when_there_are_not_enough_places()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 2));
        var (alice, _, first) = await DogOwnerAsync("alice");
        await RegisterOkAsync(alice, walk.Id, first.Id);
        var (bob, _, bobFirst) = await DogOwnerAsync("bob");
        var bobSecond = await CreateDogOfSizeAsync(bob, "Second", "Medium");

        var both = await RegisterAsync(bob, walk.Id, bobFirst.Id, bobSecond.Id);
        var one = await RegisterAsync(bob, walk.Id, bobFirst.Id);

        await AssertProblemAsync(both, HttpStatusCode.Conflict, "walk.full");
        Assert.Equal(HttpStatusCode.Created, one.StatusCode);
        await AssertProblemAsync(await RegisterAsync(bob, walk.Id, bobSecond.Id), HttpStatusCode.Conflict, "walk.full");
    }

    [Fact]
    public async Task Pending_registrations_do_not_take_a_place()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 1), ("access", "Approval"));
        var (alice, _, aliceDog) = await DogOwnerAsync("alice");
        var (bob, _, bobDog) = await DogOwnerAsync("bob");

        var alicePending = Assert.Single(await RegisterOkAsync(alice, walk.Id, aliceDog.Id));
        var bobPending = Assert.Single(await RegisterOkAsync(bob, walk.Id, bobDog.Id));

        Assert.Equal(RegistrationStatus.Pending, alicePending.Status);
        Assert.Equal(RegistrationStatus.Pending, bobPending.Status);
        Assert.Equal(0, (await GetWalkAsync(organizer, walk.Id)).AcceptedDogsCount);
    }

    [Fact]
    public async Task A_request_on_a_full_approval_walk_is_refused()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 1), ("access", "Approval"));
        await RegisterOkAsync(organizer, walk.Id, (await CreateDogAsync(organizer)).Id);
        var (alice, _, aliceDog) = await DogOwnerAsync("alice");

        await AssertProblemAsync(await RegisterAsync(alice, walk.Id, aliceDog.Id), HttpStatusCode.Conflict, "walk.full");
    }

    [Fact]
    public async Task Organizer_accepts_a_pending_registration()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"));
        var (alice, _, dog) = await DogOwnerAsync("alice");
        var pending = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));

        var response = await AcceptAsync(organizer, walk.Id, pending.Id);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var accepted = (await response.Content.ReadFromJsonAsync<RegistrationResponse>(Json, Ct))!;
        Assert.Equal(pending with { Status = RegistrationStatus.Accepted }, accepted);
        var detail = await GetWalkAsync(alice, walk.Id);
        Assert.Equal(1, detail.AcceptedDogsCount);
        Assert.Equal(pending.Id, Assert.Single(detail.Participants).RegistrationId);
    }

    [Fact]
    public async Task Accepting_twice_is_idempotent()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"));
        var (alice, _, dog) = await DogOwnerAsync("alice");
        var pending = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));
        await AcceptAsync(organizer, walk.Id, pending.Id);

        var again = await AcceptAsync(organizer, walk.Id, pending.Id);

        Assert.Equal(HttpStatusCode.OK, again.StatusCode);
        Assert.Equal(1, (await GetWalkAsync(organizer, walk.Id)).AcceptedDogsCount);
    }

    [Fact]
    public async Task Acceptance_checks_the_capacity_again()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 1), ("access", "Approval"));
        var (alice, _, aliceDog) = await DogOwnerAsync("alice");
        var (bob, _, bobDog) = await DogOwnerAsync("bob");
        var alicePending = Assert.Single(await RegisterOkAsync(alice, walk.Id, aliceDog.Id));
        var bobPending = Assert.Single(await RegisterOkAsync(bob, walk.Id, bobDog.Id));
        Assert.Equal(HttpStatusCode.OK, (await AcceptAsync(organizer, walk.Id, alicePending.Id)).StatusCode);

        var response = await AcceptAsync(organizer, walk.Id, bobPending.Id);

        await AssertProblemAsync(response, HttpStatusCode.Conflict, "walk.full");
        Assert.Equal(RegistrationStatus.Pending, await WithDbAsync(db => db.Registrations.Where(r => r.Id == bobPending.Id).Select(r => r.Status).SingleAsync(Ct)));
    }

    [Fact]
    public async Task Acceptance_checks_the_allowed_sizes_again()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"));
        var (alice, _, dog) = await DogOwnerAsync("alice", "Large");
        var pending = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));
        await organizer.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { allowedSizes = new[] { "Small" } }, Ct);

        await AssertProblemAsync(await AcceptAsync(organizer, walk.Id, pending.Id), HttpStatusCode.Conflict, "walk.size_not_allowed");
    }

    [Fact]
    public async Task Only_the_organizer_accepts_or_declines()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"));
        var (alice, _, dog) = await DogOwnerAsync("alice");
        var pending = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));

        await AssertProblemAsync(await AcceptAsync(alice, walk.Id, pending.Id), HttpStatusCode.Forbidden, "walk.forbidden");
        await AssertProblemAsync(await DeclineAsync(alice, walk.Id, pending.Id), HttpStatusCode.Forbidden, "walk.forbidden");
        Assert.Equal(RegistrationStatus.Pending, await WithDbAsync(db => db.Registrations.Select(r => r.Status).SingleAsync(Ct)));
    }

    [Fact]
    public async Task Decisions_on_unknown_walks_or_registrations_return_404()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var other = await CreateWalkAsync(organizer);
        var (alice, _, dog) = await DogOwnerAsync("alice");
        var registration = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));

        await AssertProblemAsync(await AcceptAsync(organizer, Guid.NewGuid(), registration.Id), HttpStatusCode.NotFound, "walk.not_found");
        await AssertProblemAsync(await AcceptAsync(organizer, walk.Id, Guid.NewGuid()), HttpStatusCode.NotFound, "registration.not_found");
        await AssertProblemAsync(await DeclineAsync(organizer, other.Id, registration.Id), HttpStatusCode.NotFound, "registration.not_found");
        await AssertProblemAsync(await CancelRegistrationAsync(alice, other.Id, registration.Id), HttpStatusCode.NotFound, "registration.not_found");
        await AssertProblemAsync(await CancelRegistrationAsync(alice, walk.Id, Guid.NewGuid()), HttpStatusCode.NotFound, "registration.not_found");
    }

    [Fact]
    public async Task Organizer_declines_a_pending_registration()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"));
        var (alice, _, dog) = await DogOwnerAsync("alice");
        var pending = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));

        var response = await DeclineAsync(organizer, walk.Id, pending.Id);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(RegistrationStatus.Declined, (await response.Content.ReadFromJsonAsync<RegistrationResponse>(Json, Ct))!.Status);
        Assert.Empty((await GetWalkAsync(organizer, walk.Id)).PendingRegistrations);
        Assert.Equal(RegistrationStatus.Declined, Assert.Single((await GetWalkAsync(alice, walk.Id)).MyRegistrations).Status);
    }

    [Fact]
    public async Task Organizer_removes_an_accepted_participant_and_frees_the_place()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 1));
        var (alice, _, aliceDog) = await DogOwnerAsync("alice");
        var accepted = Assert.Single(await RegisterOkAsync(alice, walk.Id, aliceDog.Id));

        var response = await DeclineAsync(organizer, walk.Id, accepted.Id);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var detail = await GetWalkAsync(organizer, walk.Id);
        Assert.Equal(0, detail.AcceptedDogsCount);
        Assert.Empty(detail.Participants);
        var (bob, _, bobDog) = await DogOwnerAsync("bob");
        await RegisterOkAsync(bob, walk.Id, bobDog.Id);
    }

    [Fact]
    public async Task Declining_twice_is_idempotent_but_a_declined_registration_cannot_be_accepted()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"));
        var (alice, _, dog) = await DogOwnerAsync("alice");
        var pending = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));
        await DeclineAsync(organizer, walk.Id, pending.Id);

        Assert.Equal(HttpStatusCode.OK, (await DeclineAsync(organizer, walk.Id, pending.Id)).StatusCode);
        await AssertProblemAsync(await AcceptAsync(organizer, walk.Id, pending.Id), HttpStatusCode.Conflict, "registration.not_active");
    }

    [Fact]
    public async Task A_cancelled_registration_cannot_be_accepted_or_declined()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"));
        var (alice, _, dog) = await DogOwnerAsync("alice");
        var pending = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));
        await CancelRegistrationAsync(alice, walk.Id, pending.Id);

        await AssertProblemAsync(await AcceptAsync(organizer, walk.Id, pending.Id), HttpStatusCode.Conflict, "registration.not_active");
        await AssertProblemAsync(await DeclineAsync(organizer, walk.Id, pending.Id), HttpStatusCode.Conflict, "registration.not_active");
    }

    [Fact]
    public async Task Decisions_are_refused_once_the_walk_has_started()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"));
        var (alice, _, dog) = await DogOwnerAsync("alice");
        var pending = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));
        await MoveWalkStartAsync(walk.Id, DateTimeOffset.UtcNow.AddMinutes(-5));

        await AssertProblemAsync(await AcceptAsync(organizer, walk.Id, pending.Id), HttpStatusCode.Conflict, "walk.not_open");
        await AssertProblemAsync(await DeclineAsync(organizer, walk.Id, pending.Id), HttpStatusCode.Conflict, "walk.not_open");
    }

    [Fact]
    public async Task A_pending_registration_cannot_be_accepted_on_a_cancelled_walk()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"));
        var (alice, _, dog) = await DogOwnerAsync("alice");
        var pending = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));
        await organizer.PostAsync($"/api/v1/walks/{walk.Id}/cancel", null, Ct);

        await AssertProblemAsync(await AcceptAsync(organizer, walk.Id, pending.Id), HttpStatusCode.Conflict, "walk.not_open");
    }

    [Fact]
    public async Task Owner_cancels_a_registration_and_frees_the_place()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("maxDogs", 1));
        var (alice, _, aliceDog) = await DogOwnerAsync("alice");
        var registration = Assert.Single(await RegisterOkAsync(alice, walk.Id, aliceDog.Id));

        var response = await CancelRegistrationAsync(alice, walk.Id, registration.Id);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var detail = await GetWalkAsync(alice, walk.Id);
        Assert.Equal(0, detail.AcceptedDogsCount);
        Assert.Equal(RegistrationStatus.Cancelled, Assert.Single(detail.MyRegistrations).Status);
        var (bob, _, bobDog) = await DogOwnerAsync("bob");
        await RegisterOkAsync(bob, walk.Id, bobDog.Id);
    }

    [Fact]
    public async Task Owner_cancels_a_pending_registration()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"));
        var (alice, _, dog) = await DogOwnerAsync("alice");
        var pending = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));

        Assert.Equal(HttpStatusCode.NoContent, (await CancelRegistrationAsync(alice, walk.Id, pending.Id)).StatusCode);
        Assert.Empty((await GetWalkAsync(organizer, walk.Id)).PendingRegistrations);
    }

    [Fact]
    public async Task Cancelling_a_registration_twice_is_idempotent()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (alice, _, dog) = await DogOwnerAsync("alice");
        var registration = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));
        await CancelRegistrationAsync(alice, walk.Id, registration.Id);

        Assert.Equal(HttpStatusCode.NoContent, (await CancelRegistrationAsync(alice, walk.Id, registration.Id)).StatusCode);
    }

    [Fact]
    public async Task Only_the_owner_cancels_a_registration()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (alice, _, dog) = await DogOwnerAsync("alice");
        var registration = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));

        await AssertProblemAsync(await CancelRegistrationAsync(organizer, walk.Id, registration.Id), HttpStatusCode.Forbidden, "registration.forbidden");
        Assert.Equal(RegistrationStatus.Accepted, await WithDbAsync(db => db.Registrations.Select(r => r.Status).SingleAsync(Ct)));
    }

    [Fact]
    public async Task A_registration_cannot_be_cancelled_once_the_walk_has_started()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (alice, _, dog) = await DogOwnerAsync("alice");
        var registration = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));
        await MoveWalkStartAsync(walk.Id, DateTimeOffset.UtcNow.AddMinutes(-1));

        await AssertProblemAsync(await CancelRegistrationAsync(alice, walk.Id, registration.Id), HttpStatusCode.Conflict, "walk.not_open");
    }

    [Fact]
    public async Task A_declined_registration_cannot_be_cancelled()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (alice, _, dog) = await DogOwnerAsync("alice");
        var registration = Assert.Single(await RegisterOkAsync(alice, walk.Id, dog.Id));
        await DeclineAsync(organizer, walk.Id, registration.Id);

        await AssertProblemAsync(await CancelRegistrationAsync(alice, walk.Id, registration.Id), HttpStatusCode.Conflict, "registration.not_active");
    }

    [Fact]
    public async Task Detail_shows_accepted_participants_with_their_dog_and_owner()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"));
        var (alice, aliceId, aliceDog) = await DogOwnerAsync("alice");
        var (bob, _, bobDog) = await DogOwnerAsync("bob");
        var accepted = Assert.Single(await RegisterOkAsync(alice, walk.Id, aliceDog.Id));
        await AcceptAsync(organizer, walk.Id, accepted.Id);
        await RegisterOkAsync(bob, walk.Id, bobDog.Id);
        var (carol, _) = await SignedInAsync("carol", "Carol");

        var detail = await GetWalkAsync(carol, walk.Id);

        var participant = Assert.Single(detail.Participants);
        Assert.Equal(accepted.Id, participant.RegistrationId);
        AssertSameDog(aliceDog, participant.Dog);
        AssertOwnedBy(participant.Dog, aliceId, "alice");
        Assert.Equal(aliceId, participant.Owner.Id);
        Assert.Equal("alice", participant.Owner.DisplayName);
        Assert.Equal(1, detail.AcceptedDogsCount);
    }

    [Fact]
    public async Task Pending_registrations_are_visible_only_to_the_organizer_and_their_author()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"));
        var (alice, aliceId, aliceDog) = await DogOwnerAsync("alice");
        var pending = Assert.Single(await RegisterOkAsync(alice, walk.Id, aliceDog.Id));
        var (bob, _) = await SignedInAsync("bob", "Bob");

        var asOrganizer = await GetWalkAsync(organizer, walk.Id);
        var asAuthor = await GetWalkAsync(alice, walk.Id);
        var asOther = await GetWalkAsync(bob, walk.Id);

        var seen = Assert.Single(asOrganizer.PendingRegistrations);
        Assert.Equal(pending.Id, seen.RegistrationId);
        AssertSameDog(aliceDog, seen.Dog);
        AssertOwnedBy(seen.Dog, aliceId, "alice");
        Assert.Equal(aliceId, seen.Owner.Id);
        Assert.Empty(asOrganizer.Participants);
        Assert.Empty(asOrganizer.MyRegistrations);

        Assert.Empty(asAuthor.PendingRegistrations);
        Assert.Equal(new MyRegistrationResponse(pending.Id, aliceDog.Id, RegistrationStatus.Pending), Assert.Single(asAuthor.MyRegistrations));

        Assert.Empty(asOther.PendingRegistrations);
        Assert.Empty(asOther.MyRegistrations);
        Assert.Empty(asOther.Participants);
    }

    [Fact]
    public async Task My_registrations_lists_every_status_of_my_dogs_on_the_walk()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (alice, _, first) = await DogOwnerAsync("alice");
        var second = await CreateDogOfSizeAsync(alice, "Second", "Small");
        var registrations = await RegisterOkAsync(alice, walk.Id, first.Id, second.Id);
        await CancelRegistrationAsync(alice, walk.Id, registrations[1].Id);

        var mine = (await GetWalkAsync(alice, walk.Id)).MyRegistrations;

        // Registrations created by one request share their creation time: compare without order.
        MyRegistrationResponse[] expected =
        [
            new(registrations[0].Id, first.Id, RegistrationStatus.Accepted),
            new(registrations[1].Id, second.Id, RegistrationStatus.Cancelled),
        ];
        Assert.Equal(expected.OrderBy(r => r.Id), mine.OrderBy(r => r.Id));
    }

    [Fact]
    public async Task Deleting_a_dog_cancels_its_upcoming_registrations_and_keeps_past_ones()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var upcoming = await CreateWalkAsync(organizer, ("maxDogs", 1));
        var pendingWalk = await CreateWalkAsync(organizer, ("access", "Approval"));
        var past = await CreateWalkAsync(organizer);
        var (alice, _, dog) = await DogOwnerAsync("alice");
        var upcomingRegistration = Assert.Single(await RegisterOkAsync(alice, upcoming.Id, dog.Id));
        var pendingRegistration = Assert.Single(await RegisterOkAsync(alice, pendingWalk.Id, dog.Id));
        var pastRegistration = Assert.Single(await RegisterOkAsync(alice, past.Id, dog.Id));
        await MoveWalkStartAsync(past.Id, DateTimeOffset.UtcNow.AddDays(-1));

        Assert.Equal(HttpStatusCode.NoContent, (await alice.DeleteAsync($"/api/v1/dogs/{dog.Id}", Ct)).StatusCode);

        var statuses = await WithDbAsync(db => db.Registrations.ToDictionaryAsync(r => r.Id, r => (r.Status, r.DogId), Ct));
        Assert.Equal((RegistrationStatus.Cancelled, (Guid?)null), statuses[upcomingRegistration.Id]);
        Assert.Equal((RegistrationStatus.Cancelled, (Guid?)null), statuses[pendingRegistration.Id]);
        Assert.Equal((RegistrationStatus.Accepted, (Guid?)null), statuses[pastRegistration.Id]);

        // The place is free again, and the past walk page still works without the dog.
        Assert.Equal(0, (await GetWalkAsync(organizer, upcoming.Id)).AcceptedDogsCount);
        var (bob, _, bobDog) = await DogOwnerAsync("bob");
        await RegisterOkAsync(bob, upcoming.Id, bobDog.Id);
        var pastDetail = await GetWalkAsync(alice, past.Id);
        Assert.Empty(pastDetail.Participants);
        Assert.Equal(new MyRegistrationResponse(pastRegistration.Id, null, RegistrationStatus.Accepted), Assert.Single(pastDetail.MyRegistrations));
    }

    [Fact]
    public async Task Suspended_users_cannot_register()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer);
        var (alice, aliceId, dog) = await DogOwnerAsync("alice");
        await WithDbAsync(db => db.Users.Where(u => u.Id == aliceId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, Features.Users.UserStatus.Suspended), Ct));

        await AssertProblemAsync(await RegisterAsync(alice, walk.Id, dog.Id), HttpStatusCode.Forbidden, "account.suspended");
    }
}
