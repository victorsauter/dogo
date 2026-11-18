using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Organizations;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Organizations;

/// <summary>Spec §4.6: join requests, decisions, roles, leaving and removal, and who may do what.</summary>
public sealed class MembershipTests(ApiFixture fixture) : OrganizationTestBase(fixture)
{
    private sealed record Club(
        Guid Id,
        HttpClient Owner,
        Guid OwnerMembershipId,
        HttpClient Educator,
        Guid EducatorMembershipId,
        HttpClient Member,
        Guid MemberMembershipId,
        HttpClient Stranger);

    /// <summary>An approved organisation with its owner, an educator, a member, and a stranger.</summary>
    private async Task<Club> ClubAsync()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var (educator, _) = await SignedInAsync("educator", "Educator");
        var educatorMembership = await AddEducatorAsync(owner, organization.Id, educator);
        var (member, _) = await SignedInAsync("member", "Member");
        var memberMembership = await AddMemberAsync(owner, organization.Id, member);
        var (stranger, _) = await SignedInAsync("stranger", "Stranger");
        await WaitForNotificationsAsync();
        return new Club(organization.Id, owner, organization.MyMembership!.Id, educator, educatorMembership.Id, member, memberMembership.Id, stranger);
    }

    [Fact]
    public async Task Asking_to_join_creates_a_pending_member_request()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var (alice, session) = await SignedInAsync("alice", "Alice");

        var response = await RequestMembershipAsync(alice, organization.Id);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.Equal(["id", "organizationId", "user", "role", "status", "createdAt"], body.EnumerateObject().Select(p => p.Name));
        Assert.Equal(["id", "displayName", "photoUrl"], body.GetProperty("user").EnumerateObject().Select(p => p.Name));
        Assert.Equal(session.User.Id, body.GetProperty("user").GetProperty("id").GetGuid());
        Assert.Equal("Member", body.GetProperty("role").GetString());
        Assert.Equal("Pending", body.GetProperty("status").GetString());
        Assert.Equal(2, await WithDbAsync(db => db.Memberships.CountAsync(m => m.OrganizationId == organization.Id, Ct)));
        Assert.Equal(1, (await GetOrganizationAsync(alice, organization.Id)).MemberCount);
    }

    [Fact]
    public async Task Asking_twice_or_as_a_member_is_refused()
    {
        var club = await ClubAsync();
        var (alice, _) = await SignedInAsync("alice", "Alice");
        await RequestMembershipOkAsync(alice, club.Id);

        await AssertProblemAsync(await RequestMembershipAsync(alice, club.Id), HttpStatusCode.Conflict, "membership.duplicate");
        await AssertProblemAsync(await RequestMembershipAsync(club.Member, club.Id), HttpStatusCode.Conflict, "membership.duplicate");
        await AssertProblemAsync(await RequestMembershipAsync(club.Owner, club.Id), HttpStatusCode.Conflict, "membership.duplicate");
    }

    [Fact]
    public async Task Concurrent_requests_create_one_membership()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var (alice, session) = await SignedInAsync("alice", "Alice");

        var responses = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => RequestMembershipAsync(alice, organization.Id)));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.All(responses.Where(r => r.StatusCode != HttpStatusCode.Created), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
        Assert.Equal(1, await WithDbAsync(db => db.Memberships.CountAsync(m => m.UserId == session.User.Id, Ct)));
    }

    [Fact]
    public async Task A_declined_user_may_ask_again()
    {
        var club = await ClubAsync();
        var (alice, _) = await SignedInAsync("alice", "Alice");
        var request = await RequestMembershipOkAsync(alice, club.Id);
        await DeclineMembershipAsync(club.Owner, club.Id, request.Id);

        var again = await RequestMembershipOkAsync(alice, club.Id);

        Assert.NotEqual(request.Id, again.Id);
        Assert.Equal(MembershipStatus.Pending, again.Status);
    }

    [Fact]
    public async Task Only_an_approved_organisation_can_be_joined()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await CreateOrganizationOkAsync(owner);
        var (stranger, _) = await SignedInAsync("stranger", "Stranger");
        var (admin, _) = await AdminAsync();

        await AssertProblemAsync(await RequestMembershipAsync(stranger, organization.Id), HttpStatusCode.NotFound, "organization.not_found");
        await AssertProblemAsync(await RequestMembershipAsync(admin, organization.Id), HttpStatusCode.Conflict, "organization.not_approved");
        await AssertProblemAsync(await RequestMembershipAsync(stranger, Guid.NewGuid()), HttpStatusCode.NotFound, "organization.not_found");
    }

    [Fact]
    public async Task The_owner_and_educators_see_members_and_requests()
    {
        var club = await ClubAsync();
        var (alice, _) = await SignedInAsync("alice", "Alice");
        var (bob, _) = await SignedInAsync("bob", "Bob");
        var aliceRequest = await RequestMembershipOkAsync(alice, club.Id);
        var bobRequest = await RequestMembershipOkAsync(bob, club.Id);
        var declined = await RequestMembershipOkAsync((await SignedInAsync("carol", "Carol")).Client, club.Id);
        await DeclineMembershipAsync(club.Owner, club.Id, declined.Id);

        foreach (var client in new[] { club.Owner, club.Educator })
        {
            var list = (await client.GetFromJsonAsync<OrganizationMembersResponse>($"/api/v1/organizations/{club.Id}/memberships", Json, Ct))!;

            Assert.Equal(
                [(club.OwnerMembershipId, MembershipRole.Owner), (club.EducatorMembershipId, MembershipRole.Educator), (club.MemberMembershipId, MembershipRole.Member)],
                list.Members.Select(m => (m.Id, m.Role)));
            Assert.Equal(["Owner", "Educator", "Member"], list.Members.Select(m => m.User.DisplayName));
            Assert.Equal([aliceRequest.Id, bobRequest.Id], list.Requests.Select(m => m.Id));
        }
    }

    [Fact]
    public async Task Members_and_strangers_cannot_see_the_member_list()
    {
        var club = await ClubAsync();

        await AssertProblemAsync(await club.Member.GetAsync($"/api/v1/organizations/{club.Id}/memberships", Ct), HttpStatusCode.Forbidden, "organization.forbidden");
        await AssertProblemAsync(await club.Stranger.GetAsync($"/api/v1/organizations/{club.Id}/memberships", Ct), HttpStatusCode.Forbidden, "organization.forbidden");
    }

    [Theory]
    [InlineData("owner")]
    [InlineData("educator")]
    public async Task The_owner_or_an_educator_accepts_a_request(string decider)
    {
        var club = await ClubAsync();
        var (alice, _) = await SignedInAsync("alice", "Alice");
        var request = await RequestMembershipOkAsync(alice, club.Id);

        var response = await AcceptMembershipAsync(decider == "owner" ? club.Owner : club.Educator, club.Id, request.Id);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(MembershipStatus.Accepted, (await response.Content.ReadFromJsonAsync<MembershipResponse>(Json, Ct))!.Status);
        Assert.Equal(MembershipStatus.Accepted, (await GetOrganizationAsync(alice, club.Id)).MyMembership!.Status);

        // Idempotent.
        Assert.Equal(HttpStatusCode.OK, (await AcceptMembershipAsync(club.Owner, club.Id, request.Id)).StatusCode);
    }

    [Theory]
    [InlineData("owner")]
    [InlineData("educator")]
    public async Task The_owner_or_an_educator_declines_a_request(string decider)
    {
        var club = await ClubAsync();
        var (alice, _) = await SignedInAsync("alice", "Alice");
        var request = await RequestMembershipOkAsync(alice, club.Id);

        var response = await DeclineMembershipAsync(decider == "owner" ? club.Owner : club.Educator, club.Id, request.Id);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(MembershipStatus.Declined, (await response.Content.ReadFromJsonAsync<MembershipResponse>(Json, Ct))!.Status);
        Assert.Equal(HttpStatusCode.OK, (await DeclineMembershipAsync(club.Owner, club.Id, request.Id)).StatusCode);
        await AssertProblemAsync(await AcceptMembershipAsync(club.Owner, club.Id, request.Id), HttpStatusCode.Conflict, "membership.not_pending");
    }

    [Fact]
    public async Task Members_and_strangers_cannot_decide_on_requests()
    {
        var club = await ClubAsync();
        var (alice, _) = await SignedInAsync("alice", "Alice");
        var request = await RequestMembershipOkAsync(alice, club.Id);

        foreach (var client in new[] { club.Member, club.Stranger, alice })
        {
            await AssertProblemAsync(await AcceptMembershipAsync(client, club.Id, request.Id), HttpStatusCode.Forbidden, "organization.forbidden");
            await AssertProblemAsync(await DeclineMembershipAsync(client, club.Id, request.Id), HttpStatusCode.Forbidden, "organization.forbidden");
        }

        Assert.Equal(MembershipStatus.Pending, await WithDbAsync(db => db.Memberships.Where(m => m.Id == request.Id).Select(m => m.Status).SingleAsync(Ct)));
    }

    [Fact]
    public async Task An_accepted_member_cannot_be_declined()
    {
        var club = await ClubAsync();

        await AssertProblemAsync(await DeclineMembershipAsync(club.Owner, club.Id, club.MemberMembershipId), HttpStatusCode.Conflict, "membership.not_pending");
    }

    [Fact]
    public async Task Unknown_memberships_and_memberships_of_another_organisation_are_not_found()
    {
        var club = await ClubAsync();
        var (other, _) = await SignedInAsync("other", "Other");
        var otherOrganization = await ApprovedOrganizationAsync(other, "Autre club");

        await AssertProblemAsync(await AcceptMembershipAsync(club.Owner, club.Id, Guid.NewGuid()), HttpStatusCode.NotFound, "membership.not_found");
        await AssertProblemAsync(await AcceptMembershipAsync(club.Owner, club.Id, otherOrganization.MyMembership!.Id), HttpStatusCode.NotFound, "membership.not_found");
        await AssertProblemAsync(await DeleteMembershipAsync(club.Owner, club.Id, otherOrganization.MyMembership.Id), HttpStatusCode.NotFound, "membership.not_found");
        await AssertProblemAsync(await SetRoleAsync(club.Owner, club.Id, Guid.NewGuid(), "Educator"), HttpStatusCode.NotFound, "membership.not_found");
    }

    [Fact]
    public async Task Decisions_on_a_closed_organisation_are_refused()
    {
        var club = await ClubAsync();
        var (alice, _) = await SignedInAsync("alice", "Alice");
        var request = await RequestMembershipOkAsync(alice, club.Id);
        await WithDbAsync(db => db.Organizations.Where(o => o.Id == club.Id).ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, OrganizationStatus.Closed), Ct));

        await AssertProblemAsync(await AcceptMembershipAsync(club.Owner, club.Id, request.Id), HttpStatusCode.Conflict, "organization.closed");
        await AssertProblemAsync(await SetRoleAsync(club.Owner, club.Id, club.MemberMembershipId, "Educator"), HttpStatusCode.Conflict, "organization.closed");
    }

    [Fact]
    public async Task The_owner_names_and_demotes_educators()
    {
        var club = await ClubAsync();

        var promoted = await SetRoleAsync(club.Owner, club.Id, club.MemberMembershipId, "Educator");
        var demoted = await SetRoleAsync(club.Owner, club.Id, club.EducatorMembershipId, "Member");

        Assert.Equal(MembershipRole.Educator, (await promoted.Content.ReadFromJsonAsync<MembershipResponse>(Json, Ct))!.Role);
        Assert.Equal(MembershipRole.Member, (await demoted.Content.ReadFromJsonAsync<MembershipResponse>(Json, Ct))!.Role);

        // The new educator manages requests; the former one no longer does.
        Assert.Equal(HttpStatusCode.OK, (await club.Member.GetAsync($"/api/v1/organizations/{club.Id}/memberships", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await club.Educator.GetAsync($"/api/v1/organizations/{club.Id}/memberships", Ct)).StatusCode);
    }

    [Fact]
    public async Task Only_the_owner_changes_roles()
    {
        var club = await ClubAsync();

        foreach (var client in new[] { club.Educator, club.Member, club.Stranger })
        {
            await AssertProblemAsync(await SetRoleAsync(client, club.Id, club.MemberMembershipId, "Educator"), HttpStatusCode.Forbidden, "organization.forbidden");
        }
    }

    [Fact]
    public async Task Role_changes_are_limited_to_accepted_members_and_never_touch_the_owner()
    {
        var club = await ClubAsync();
        var (alice, _) = await SignedInAsync("alice", "Alice");
        var request = await RequestMembershipOkAsync(alice, club.Id);

        await AssertValidationProblemAsync(await SetRoleAsync(club.Owner, club.Id, club.MemberMembershipId, "Owner"), "role");
        await AssertProblemAsync(await SetRoleAsync(club.Owner, club.Id, club.OwnerMembershipId, "Member"), HttpStatusCode.Conflict, "membership.owner_role");
        await AssertProblemAsync(await SetRoleAsync(club.Owner, club.Id, request.Id, "Educator"), HttpStatusCode.Conflict, "membership.not_accepted");
        await AssertValidationProblemAsync(await SetRoleAsync(club.Owner, club.Id, club.MemberMembershipId, "Boss"), "role");
    }

    [Fact]
    public async Task A_member_leaves_and_a_requester_withdraws()
    {
        var club = await ClubAsync();
        var (alice, _) = await SignedInAsync("alice", "Alice");
        var request = await RequestMembershipOkAsync(alice, club.Id);

        Assert.Equal(HttpStatusCode.NoContent, (await DeleteMembershipAsync(club.Member, club.Id, club.MemberMembershipId)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await DeleteMembershipAsync(club.Educator, club.Id, club.EducatorMembershipId)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await DeleteMembershipAsync(alice, club.Id, request.Id)).StatusCode);

        Assert.Equal(1, (await GetOrganizationAsync(club.Owner, club.Id)).MemberCount);
        Assert.Null((await GetOrganizationAsync(club.Member, club.Id)).MyMembership);
        Assert.Equal(1, await WithDbAsync(db => db.Memberships.CountAsync(m => m.OrganizationId == club.Id, Ct)));
    }

    [Fact]
    public async Task A_requester_withdraws_even_when_the_organisation_is_no_longer_visible()
    {
        var club = await ClubAsync();
        var (alice, _) = await SignedInAsync("alice", "Alice");
        var request = await RequestMembershipOkAsync(alice, club.Id);
        await WithDbAsync(db => db.Organizations.Where(o => o.Id == club.Id).ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, OrganizationStatus.Rejected), Ct));

        Assert.Equal(HttpStatusCode.NoContent, (await DeleteMembershipAsync(alice, club.Id, request.Id)).StatusCode);
    }

    [Fact]
    public async Task The_sole_owner_cannot_leave()
    {
        var club = await ClubAsync();

        await AssertProblemAsync(await DeleteMembershipAsync(club.Owner, club.Id, club.OwnerMembershipId), HttpStatusCode.Conflict, "membership.sole_owner");
        Assert.Equal(MembershipRole.Owner, (await GetOrganizationAsync(club.Owner, club.Id)).MyMembership!.Role);
    }

    [Theory]
    [InlineData("owner")]
    [InlineData("educator")]
    public async Task The_owner_or_an_educator_removes_a_member(string remover)
    {
        var club = await ClubAsync();
        var (alice, _) = await SignedInAsync("alice", "Alice");
        var request = await RequestMembershipOkAsync(alice, club.Id);
        var client = remover == "owner" ? club.Owner : club.Educator;

        Assert.Equal(HttpStatusCode.NoContent, (await DeleteMembershipAsync(client, club.Id, club.MemberMembershipId)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await DeleteMembershipAsync(client, club.Id, request.Id)).StatusCode);

        Assert.Equal(2, (await GetOrganizationAsync(club.Owner, club.Id)).MemberCount);
    }

    [Fact]
    public async Task Only_the_owner_removes_an_educator_and_nobody_removes_the_owner()
    {
        var club = await ClubAsync();
        var (second, _) = await SignedInAsync("second", "Second");
        var secondEducator = await AddEducatorAsync(club.Owner, club.Id, second);

        await AssertProblemAsync(await DeleteMembershipAsync(club.Educator, club.Id, secondEducator.Id), HttpStatusCode.Forbidden, "organization.forbidden");
        await AssertProblemAsync(await DeleteMembershipAsync(club.Educator, club.Id, club.OwnerMembershipId), HttpStatusCode.Forbidden, "organization.forbidden");
        Assert.Equal(HttpStatusCode.NoContent, (await DeleteMembershipAsync(club.Owner, club.Id, secondEducator.Id)).StatusCode);
    }

    [Fact]
    public async Task Members_and_strangers_cannot_remove_anyone()
    {
        var club = await ClubAsync();
        var (other, _) = await SignedInAsync("other", "Other");
        var otherMember = await AddMemberAsync(club.Owner, club.Id, other);

        foreach (var client in new[] { club.Member, club.Stranger })
        {
            await AssertProblemAsync(await DeleteMembershipAsync(client, club.Id, otherMember.Id), HttpStatusCode.Forbidden, "organization.forbidden");
            await AssertProblemAsync(await DeleteMembershipAsync(client, club.Id, club.EducatorMembershipId), HttpStatusCode.Forbidden, "organization.forbidden");
        }

        Assert.Equal(4, (await GetOrganizationAsync(club.Owner, club.Id)).MemberCount);
    }
}
