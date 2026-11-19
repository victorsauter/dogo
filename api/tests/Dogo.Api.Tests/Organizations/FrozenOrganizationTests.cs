using System.Net;
using Dogo.Api.Features.Organizations;
using Dogo.Api.Features.Walks;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Organizations;

/// <summary>
/// Spec §4.6 and ADR 0037: a professional walk whose organisation is no longer approved is
/// frozen (no new registration, its series stops, existing walks and registrations stay), and a
/// member who leaves loses their upcoming registrations to the organisation's walks.
/// </summary>
public sealed class FrozenOrganizationTests(ApiFixture fixture) : OrganizationTestBase(fixture)
{
    private sealed record Club(
        HttpClient Owner,
        Guid OrganizationId,
        HttpClient Educator,
        Guid EducatorMembershipId,
        HttpClient Member,
        Guid MemberDogId,
        Guid MemberMembershipId);

    /// <summary>An approved club with an owner, an educator and a member who owns a dog.</summary>
    private async Task<Club> ClubAsync()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var (educator, _) = await SignedInAsync("educator", "Educator");
        var educatorMembership = await AddEducatorAsync(owner, organization.Id, educator);
        var (member, _, dog) = await DogOwnerAsync("member");
        var memberMembership = await AddMemberAsync(owner, organization.Id, member);
        return new Club(owner, organization.Id, educator, educatorMembership.Id, member, dog.Id, memberMembership.Id);
    }

    private Task<bool> SeriesActiveAsync(Guid walkId) =>
        WithDbAsync(db => db.Walks.Where(w => w.Id == walkId).Select(w => w.Series!.Active).SingleAsync(Ct));

    private Task<RegistrationStatus> RegistrationStatusAsync(Guid registrationId) =>
        WithDbAsync(db => db.Registrations.Where(r => r.Id == registrationId).Select(r => r.Status).SingleAsync(Ct));

    [Fact]
    public async Task When_the_sole_owner_deletes_their_account_the_educators_walks_freeze()
    {
        var club = await ClubAsync();
        var walk = await CreateWalkAsync(club.Educator, ("organizationId", club.OrganizationId), ("repeatWeekly", true));
        var registration = Assert.Single(await RegisterOkAsync(club.Member, walk.Id, club.MemberDogId));
        var (latecomer, _, latecomerDog) = await DogOwnerAsync("latecomer");
        await AddMemberAsync(club.Owner, club.OrganizationId, latecomer);

        Assert.Equal(HttpStatusCode.NoContent, (await club.Owner.DeleteAsync("/api/v1/me", Ct)).StatusCode);
        Assert.Equal(OrganizationStatus.Closed, await WithDbAsync(db => db.Organizations.Select(o => o.Status).SingleAsync(Ct)));

        // No new registration, not even from a member: the walk answers like one that is no longer open.
        await AssertProblemAsync(await RegisterAsync(latecomer, walk.Id, latecomerDog.Id), HttpStatusCode.Conflict, "walk.not_open");

        // The walk and its accepted registration stay; the series creates nothing and stops.
        Assert.Equal(RegistrationStatus.Accepted, await RegistrationStatusAsync(registration.Id));
        Assert.Equal(WalkStatus.Scheduled, (await GetWalkAsync(club.Educator, walk.Id)).Status);
        Assert.Equal(0, await RunSeriesJobAsync(walk.StartsAt.AddMinutes(1)));
        Assert.Equal(0, await RunSeriesJobAsync(walk.StartsAt.AddDays(8)));
        Assert.Equal(1, await WithDbAsync(db => db.Walks.CountAsync(Ct)));
        Assert.False(await SeriesActiveAsync(walk.Id));
    }

    [Fact]
    public async Task The_organizer_can_still_cancel_a_frozen_walk()
    {
        var club = await ClubAsync();
        var walk = await CreateWalkAsync(club.Educator, ("organizationId", club.OrganizationId));
        await club.Owner.DeleteAsync("/api/v1/me", Ct);

        var response = await club.Educator.PostAsync($"/api/v1/walks/{walk.Id}/cancel", null, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(WalkStatus.Cancelled, (await GetWalkAsync(club.Educator, walk.Id)).Status);
    }

    [Fact]
    public async Task Rejecting_an_approved_organisation_freezes_its_walks_and_stops_its_series()
    {
        var club = await ClubAsync();
        var walk = await CreateWalkAsync(club.Owner, ("organizationId", club.OrganizationId), ("repeatWeekly", true));
        var (admin, _) = await AdminAsync();

        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/v1/admin/organizations/{club.OrganizationId}/reject", null, Ct)).StatusCode);

        await AssertProblemAsync(await RegisterAsync(club.Member, walk.Id, club.MemberDogId), HttpStatusCode.Conflict, "walk.not_open");
        Assert.Equal(0, await RunSeriesJobAsync(walk.StartsAt.AddMinutes(1)));
        Assert.False(await SeriesActiveAsync(walk.Id));
    }

    [Fact]
    public async Task A_pending_request_cannot_be_accepted_once_the_organisation_is_rejected()
    {
        var club = await ClubAsync();
        var walk = await CreateWalkAsync(club.Owner, ("organizationId", club.OrganizationId), ("access", "Approval"));
        var request = Assert.Single(await RegisterOkAsync(club.Member, walk.Id, club.MemberDogId));
        var (admin, _) = await AdminAsync();
        await admin.PostAsync($"/api/v1/admin/organizations/{club.OrganizationId}/reject", null, Ct);

        await AssertProblemAsync(await AcceptAsync(club.Owner, walk.Id, request.Id), HttpStatusCode.Conflict, "walk.not_open");
        Assert.Equal(RegistrationStatus.Pending, await RegistrationStatusAsync(request.Id));
    }

    [Fact]
    public async Task A_member_who_leaves_loses_their_upcoming_registrations_to_the_organisations_walks()
    {
        var club = await ClubAsync();
        var open = await CreateWalkAsync(club.Owner, ("organizationId", club.OrganizationId), ("maxDogs", 1));
        var approval = await CreateWalkAsync(club.Educator, ("organizationId", club.OrganizationId), ("access", "Approval"));
        var past = await CreateWalkAsync(club.Owner, ("organizationId", club.OrganizationId));
        var personal = await CreateWalkAsync(club.Owner);
        var accepted = Assert.Single(await RegisterOkAsync(club.Member, open.Id, club.MemberDogId));
        var pending = Assert.Single(await RegisterOkAsync(club.Member, approval.Id, club.MemberDogId));
        var history = Assert.Single(await RegisterOkAsync(club.Member, past.Id, club.MemberDogId));
        var elsewhere = Assert.Single(await RegisterOkAsync(club.Member, personal.Id, club.MemberDogId));
        await MoveWalkStartAsync(past.Id, DateTimeOffset.UtcNow.AddHours(-1));

        Assert.Equal(HttpStatusCode.NoContent, (await DeleteMembershipAsync(club.Member, club.OrganizationId, club.MemberMembershipId)).StatusCode);

        Assert.Equal(RegistrationStatus.Cancelled, await RegistrationStatusAsync(accepted.Id));
        Assert.Equal(RegistrationStatus.Cancelled, await RegistrationStatusAsync(pending.Id));
        Assert.Equal(RegistrationStatus.Accepted, await RegistrationStatusAsync(history.Id));
        Assert.Equal(RegistrationStatus.Accepted, await RegistrationStatusAsync(elsewhere.Id));

        // The place is free again for another member.
        Assert.Equal(0, (await GetWalkAsync(club.Owner, open.Id)).AcceptedDogsCount);
        var (other, _, otherDog) = await DogOwnerAsync("other");
        await AddMemberAsync(club.Owner, club.OrganizationId, other);
        await RegisterOkAsync(other, open.Id, otherDog.Id);
    }

    [Fact]
    public async Task A_removed_member_loses_their_upcoming_registrations_too()
    {
        var club = await ClubAsync();
        var walk = await CreateWalkAsync(club.Owner, ("organizationId", club.OrganizationId));
        var registration = Assert.Single(await RegisterOkAsync(club.Member, walk.Id, club.MemberDogId));

        Assert.Equal(HttpStatusCode.NoContent, (await DeleteMembershipAsync(club.Educator, club.OrganizationId, club.MemberMembershipId)).StatusCode);

        Assert.Equal(RegistrationStatus.Cancelled, await RegistrationStatusAsync(registration.Id));
    }

    [Fact]
    public async Task An_educator_who_leaves_keeps_their_dogs_on_their_own_walks()
    {
        var club = await ClubAsync();
        var ownWalk = await CreateWalkAsync(club.Educator, ("organizationId", club.OrganizationId));
        var ownersWalk = await CreateWalkAsync(club.Owner, ("organizationId", club.OrganizationId));
        var dog = await CreateDogAsync(club.Educator);
        var onOwnWalk = Assert.Single(await RegisterOkAsync(club.Educator, ownWalk.Id, dog.Id));
        var onOwnersWalk = Assert.Single(await RegisterOkAsync(club.Educator, ownersWalk.Id, dog.Id));

        await DeleteMembershipAsync(club.Educator, club.OrganizationId, club.EducatorMembershipId);

        Assert.Equal(RegistrationStatus.Accepted, await RegistrationStatusAsync(onOwnWalk.Id));
        Assert.Equal(RegistrationStatus.Cancelled, await RegistrationStatusAsync(onOwnersWalk.Id));
    }

    [Fact]
    public async Task A_request_of_a_member_who_left_cannot_be_accepted()
    {
        var club = await ClubAsync();
        var walk = await CreateWalkAsync(club.Owner, ("organizationId", club.OrganizationId), ("access", "Approval"));
        var request = Assert.Single(await RegisterOkAsync(club.Member, walk.Id, club.MemberDogId));

        await DeleteMembershipAsync(club.Member, club.OrganizationId, club.MemberMembershipId);

        // Leaving cancelled the request.
        await AssertProblemAsync(await AcceptAsync(club.Owner, walk.Id, request.Id), HttpStatusCode.Conflict, "registration.not_active");
        Assert.Equal(0, (await GetWalkAsync(club.Owner, walk.Id)).AcceptedDogsCount);
    }

    [Fact]
    public async Task Acceptance_replays_the_membership_rule()
    {
        var club = await ClubAsync();
        var walk = await CreateWalkAsync(club.Owner, ("organizationId", club.OrganizationId), ("access", "Approval"));
        var request = Assert.Single(await RegisterOkAsync(club.Member, walk.Id, club.MemberDogId));

        // A membership gone without its registrations being cancelled (data written before this rule).
        await WithDbAsync(db => db.Memberships.Where(m => m.Id == club.MemberMembershipId).ExecuteDeleteAsync(Ct));

        await AssertProblemAsync(await AcceptAsync(club.Owner, walk.Id, request.Id), HttpStatusCode.Forbidden, "walk.members_only");
        Assert.Equal(RegistrationStatus.Pending, await RegistrationStatusAsync(request.Id));
    }

    [Fact]
    public async Task A_demoted_educators_series_stops_at_its_next_occurrence_and_their_walks_stay()
    {
        var club = await ClubAsync();
        var walk = await CreateWalkAsync(club.Educator, ("organizationId", club.OrganizationId), ("repeatWeekly", true));
        var registration = Assert.Single(await RegisterOkAsync(club.Member, walk.Id, club.MemberDogId));

        Assert.Equal(HttpStatusCode.OK, (await SetRoleAsync(club.Owner, club.OrganizationId, club.EducatorMembershipId, "Member")).StatusCode);

        Assert.Equal(0, await RunSeriesJobAsync(walk.StartsAt.AddMinutes(1)));
        Assert.False(await SeriesActiveAsync(walk.Id));
        Assert.Equal(WalkStatus.Scheduled, (await GetWalkAsync(club.Educator, walk.Id)).Status);
        Assert.Equal(RegistrationStatus.Accepted, await RegistrationStatusAsync(registration.Id));
    }

    [Fact]
    public async Task A_removed_educators_series_stops_too()
    {
        var club = await ClubAsync();
        var walk = await CreateWalkAsync(club.Educator, ("organizationId", club.OrganizationId), ("repeatWeekly", true));

        await DeleteMembershipAsync(club.Owner, club.OrganizationId, club.EducatorMembershipId);

        Assert.Equal(0, await RunSeriesJobAsync(walk.StartsAt.AddMinutes(1)));
        Assert.False(await SeriesActiveAsync(walk.Id));
    }

    [Fact]
    public async Task The_series_of_an_educator_still_in_charge_goes_on()
    {
        var club = await ClubAsync();
        var walk = await CreateWalkAsync(club.Educator, ("organizationId", club.OrganizationId), ("repeatWeekly", true));

        Assert.Equal(1, await RunSeriesJobAsync(walk.StartsAt.AddMinutes(1)));
        Assert.True(await SeriesActiveAsync(walk.Id));
    }
}
