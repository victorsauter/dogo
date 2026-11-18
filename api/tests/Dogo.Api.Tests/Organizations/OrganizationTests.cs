using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Dogo.Api.Features.Organizations;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Organizations;

/// <summary>Spec §4.6: requesting, finding, reading and updating organisations.</summary>
public sealed class OrganizationTests(ApiFixture fixture) : OrganizationTestBase(fixture)
{
    [Fact]
    public async Task Creating_an_organisation_makes_it_pending_with_the_creator_as_owner()
    {
        var (client, session) = await SignedInAsync("owner", "Owner");

        var response = await CreateOrganizationAsync(client, new { name = "  Club canin du lac  ", description = " Éducation. ", city = " Annecy " });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.Equal(
            ["id", "name", "description", "city", "status", "createdAt", "memberCount", "educators", "myMembership", "upcomingWalks"],
            body.EnumerateObject().Select(p => p.Name));
        var organization = body.Deserialize<OrganizationDetailResponse>(Json)!;
        Assert.Equal($"/api/v1/organizations/{organization.Id}", response.Headers.Location?.OriginalString);
        Assert.Equal(("Club canin du lac", "Éducation.", "Annecy"), (organization.Name, organization.Description, organization.City));
        Assert.Equal(OrganizationStatus.Pending, organization.Status);
        Assert.Equal(1, organization.MemberCount);
        var owner = Assert.Single(organization.Educators);
        Assert.Equal((session.User.Id, MembershipRole.Owner), (owner.User.Id, owner.Role));
        Assert.Equal((MembershipRole.Owner, MembershipStatus.Accepted), (organization.MyMembership!.Role, organization.MyMembership.Status));
        Assert.Empty(organization.UpcomingWalks);

        var stored = await WithDbAsync(db => db.Organizations.SingleAsync(Ct));
        Assert.Equal(session.User.Id, stored.CreatedById);
        Assert.Equal(organization.CreatedAt, stored.CreatedAt);
    }

    [Fact]
    public async Task Description_and_city_are_optional()
    {
        var (client, _) = await SignedInAsync();

        var response = await CreateOrganizationAsync(client, new { name = "Club", city = "   " });

        var organization = (await response.Content.ReadFromJsonAsync<OrganizationDetailResponse>(Json, Ct))!;
        Assert.Equal(("", (string?)null), (organization.Description, organization.City));
    }

    [Fact]
    public async Task Creation_validates_the_fields()
    {
        var (client, _) = await SignedInAsync();

        var missing = await CreateOrganizationAsync(client, new { city = "Annecy" });
        var invalid = await CreateOrganizationAsync(client, new { name = "  ab  ", description = new string('d', 2001), city = new string('c', 81) });
        var tooLong = await CreateOrganizationAsync(client, new { name = new string('n', 81) });

        await AssertValidationProblemAsync(missing, "name");
        await AssertValidationProblemAsync(invalid, "name", "description", "city");
        await AssertValidationProblemAsync(tooLong, "name");
        Assert.Equal(0, await WithDbAsync(db => db.Organizations.CountAsync(Ct)));
    }

    [Fact]
    public async Task A_user_may_have_at_most_three_pending_organisations()
    {
        var (client, _) = await SignedInAsync();
        var first = await CreateOrganizationOkAsync(client, "Premier");
        await CreateOrganizationOkAsync(client, "Deuxième");
        await CreateOrganizationOkAsync(client, "Troisième");

        await AssertProblemAsync(await CreateOrganizationAsync(client, new { name = "Quatrième" }), HttpStatusCode.Conflict, "organization.too_many_pending");

        // Another user is not concerned, and an approved one frees a slot.
        var (other, _) = await SignedInAsync("bob", "Bob");
        await CreateOrganizationOkAsync(other, "Autre");
        await ApproveAsync(first.Id);
        await CreateOrganizationOkAsync(client, "Quatrième");
        Assert.Equal(5, await WithDbAsync(db => db.Organizations.CountAsync(Ct)));
    }

    [Fact]
    public async Task Concurrent_creations_do_not_exceed_the_pending_limit()
    {
        var (client, _) = await SignedInAsync();

        var responses = await Task.WhenAll(Enumerable.Range(0, 6).Select(i => CreateOrganizationAsync(client, new { name = $"Club {i}" })));

        Assert.Equal(3, responses.Count(r => r.StatusCode == HttpStatusCode.Created));
        Assert.Equal(3, responses.Count(r => r.StatusCode == HttpStatusCode.Conflict));
    }

    [Fact]
    public async Task Search_returns_approved_organisations_by_name_or_city_case_insensitively()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var lake = await ApprovedOrganizationAsync(owner, "Club canin du Lac", "Annecy");
        var city = await ApprovedOrganizationAsync(owner, "Éducateurs associés", "Lacanau");
        await ApprovedOrganizationAsync(owner, "Promenades du Rhône", "Lyon");
        await CreateOrganizationOkAsync(owner, "Lac en attente", "Annecy");
        var (stranger, _) = await SignedInAsync("stranger", "Stranger");

        var results = (await stranger.GetFromJsonAsync<List<OrganizationSummaryResponse>>("/api/v1/organizations?query=LAC", Json, Ct))!;
        var all = await stranger.GetFromJsonAsync<List<OrganizationSummaryResponse>>("/api/v1/organizations", Json, Ct);

        Assert.Equal([lake.Id, city.Id], results!.Select(o => o.Id));
        Assert.Equal(3, all!.Count);
        Assert.All(all, o => Assert.Equal(OrganizationStatus.Approved, o.Status));
        var item = results[0];
        Assert.Equal(("Club canin du Lac", "Annecy", 1), (item.Name, item.City, item.MemberCount));
    }

    [Fact]
    public async Task Search_treats_like_wildcards_literally_and_validates_its_parameters()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        await ApprovedOrganizationAsync(owner, "Club 100%", "Annecy");
        await ApprovedOrganizationAsync(owner, "Club 1000", "Annecy");

        var percent = await owner.GetFromJsonAsync<List<OrganizationSummaryResponse>>("/api/v1/organizations?query=100%25", Json, Ct);
        var underscore = await owner.GetFromJsonAsync<List<OrganizationSummaryResponse>>("/api/v1/organizations?query=Club_", Json, Ct);
        var limited = await owner.GetFromJsonAsync<List<OrganizationSummaryResponse>>("/api/v1/organizations?limit=1", Json, Ct);

        Assert.Equal(["Club 100%"], percent!.Select(o => o.Name));
        Assert.Empty(underscore!);
        Assert.Single(limited!);
        await AssertValidationProblemAsync(await owner.GetAsync("/api/v1/organizations?limit=101", Ct), "limit");
        await AssertValidationProblemAsync(await owner.GetAsync($"/api/v1/organizations?query={new string('q', 81)}", Ct), "query");
    }

    [Fact]
    public async Task An_approved_organisation_is_visible_to_everyone()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var (stranger, _) = await SignedInAsync("stranger", "Stranger");

        var seen = await GetOrganizationAsync(stranger, organization.Id);

        Assert.Equal(OrganizationStatus.Approved, seen.Status);
        Assert.Null(seen.MyMembership);
        Assert.Single(seen.Educators);
    }

    [Theory]
    [InlineData("Pending")]
    [InlineData("Rejected")]
    [InlineData("Closed")]
    public async Task An_organisation_that_is_not_approved_is_visible_only_to_its_members_and_administrators(string status)
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await CreateOrganizationOkAsync(owner);
        await SetStatusAsync(organization.Id, Enum.Parse<OrganizationStatus>(status));
        var (stranger, _) = await SignedInAsync("stranger", "Stranger");
        var (admin, _) = await AdminAsync();

        await AssertProblemAsync(await stranger.GetAsync($"/api/v1/organizations/{organization.Id}", Ct), HttpStatusCode.NotFound, "organization.not_found");
        await AssertProblemAsync(await RequestMembershipAsync(stranger, organization.Id), HttpStatusCode.NotFound, "organization.not_found");
        Assert.Equal(status, (await GetOrganizationAsync(owner, organization.Id)).Status.ToString());
        Assert.Equal(status, (await GetOrganizationAsync(admin, organization.Id)).Status.ToString());
        Assert.Empty((await stranger.GetFromJsonAsync<List<OrganizationSummaryResponse>>("/api/v1/organizations", Json, Ct))!);
    }

    [Fact]
    public async Task A_pending_request_does_not_make_a_non_approved_organisation_visible()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var (alice, _) = await SignedInAsync("alice", "Alice");
        await RequestMembershipOkAsync(alice, organization.Id);
        await SetStatusAsync(organization.Id, OrganizationStatus.Rejected);

        await AssertProblemAsync(await alice.GetAsync($"/api/v1/organizations/{organization.Id}", Ct), HttpStatusCode.NotFound, "organization.not_found");
    }

    [Fact]
    public async Task An_unknown_organisation_is_not_found()
    {
        var (client, _) = await SignedInAsync();

        await AssertProblemAsync(await client.GetAsync($"/api/v1/organizations/{Guid.NewGuid()}", Ct), HttpStatusCode.NotFound, "organization.not_found");
    }

    [Fact]
    public async Task The_page_shows_the_owner_and_educators_the_member_count_and_my_membership()
    {
        var (owner, ownerSession) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var (educator, educatorSession) = await SignedInAsync("educator", "Educator");
        await AddEducatorAsync(owner, organization.Id, educator);
        var (member, _) = await SignedInAsync("member", "Member");
        var membership = await AddMemberAsync(owner, organization.Id, member);
        var (pending, _) = await SignedInAsync("pending", "Pending");
        var request = await RequestMembershipOkAsync(pending, organization.Id);

        var asMember = await GetOrganizationAsync(member, organization.Id);
        var asPending = await GetOrganizationAsync(pending, organization.Id);

        Assert.Equal(3, asMember.MemberCount);
        Assert.Equal(
            [(ownerSession.User.Id, MembershipRole.Owner), (educatorSession.User.Id, MembershipRole.Educator)],
            asMember.Educators.Select(e => (e.User.Id, e.Role)));
        Assert.Equal(new MyMembershipResponse(membership.Id, MembershipRole.Member, MembershipStatus.Accepted), asMember.MyMembership);
        Assert.Equal(new MyMembershipResponse(request.Id, MembershipRole.Member, MembershipStatus.Pending), asPending.MyMembership);
    }

    [Fact]
    public async Task The_page_shows_a_declined_request_until_a_new_one_is_made()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var (alice, _) = await SignedInAsync("alice", "Alice");
        var declined = await RequestMembershipOkAsync(alice, organization.Id);
        await DeclineMembershipAsync(owner, organization.Id, declined.Id);

        Assert.Equal(MembershipStatus.Declined, (await GetOrganizationAsync(alice, organization.Id)).MyMembership!.Status);

        var again = await RequestMembershipOkAsync(alice, organization.Id);
        Assert.Equal((again.Id, MembershipStatus.Pending), ((await GetOrganizationAsync(alice, organization.Id)).MyMembership!.Id, MembershipStatus.Pending));
    }

    [Fact]
    public async Task The_page_lists_the_upcoming_scheduled_walks_of_the_organisation()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var later = await CreateWalkAsync(owner, ("organizationId", organization.Id), ("title", "Plus tard"), ("startsAt", Tomorrow.AddDays(2)));
        var soon = await CreateWalkAsync(owner, ("organizationId", organization.Id), ("title", "Bientôt"));
        var cancelled = await CreateWalkAsync(owner, ("organizationId", organization.Id));
        await owner.PostAsync($"/api/v1/walks/{cancelled.Id}/cancel", null, Ct);
        var past = await CreateWalkAsync(owner, ("organizationId", organization.Id));
        await MoveWalkStartAsync(past.Id, DateTimeOffset.UtcNow.AddHours(-1));
        await CreateWalkAsync(owner, ("title", "Personnelle"));
        var (stranger, _) = await SignedInAsync("stranger", "Stranger");

        var page = await GetOrganizationAsync(stranger, organization.Id);

        Assert.Equal([soon.Id, later.Id], page.UpcomingWalks.Select(w => w.Id));
        var walk = page.UpcomingWalks[0];
        Assert.True(walk.IsProfessional);
        Assert.Equal(new Dogo.Api.Features.Walks.WalkOrganizationResponse(organization.Id, organization.Name), walk.Organization);
        Assert.Equal("Bientôt", walk.Title);
    }

    [Fact]
    public async Task The_page_lists_at_most_twenty_walks()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        for (var i = 0; i < 21; i++)
        {
            await CreateWalkAsync(owner, ("organizationId", organization.Id), ("startsAt", Tomorrow.AddHours(i)));
        }

        Assert.Equal(20, (await GetOrganizationAsync(owner, organization.Id)).UpcomingWalks.Count);
    }

    [Fact]
    public async Task The_owner_updates_the_organisation()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await CreateOrganizationOkAsync(owner);

        var response = await owner.PatchAsJsonAsync($"/api/v1/organizations/{organization.Id}", new { name = " Nouveau nom ", city = "" }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = (await response.Content.ReadFromJsonAsync<OrganizationDetailResponse>(Json, Ct))!;
        Assert.Equal(("Nouveau nom", organization.Description, (string?)null), (updated.Name, updated.Description, updated.City));
        Assert.Equal(OrganizationStatus.Pending, updated.Status);
    }

    [Fact]
    public async Task Only_the_owner_updates_the_organisation()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var (educator, _) = await SignedInAsync("educator", "Educator");
        await AddEducatorAsync(owner, organization.Id, educator);
        var (member, _) = await SignedInAsync("member", "Member");
        await AddMemberAsync(owner, organization.Id, member);
        var (stranger, _) = await SignedInAsync("stranger", "Stranger");
        var body = new { name = "Pris" };

        foreach (var client in new[] { educator, member, stranger })
        {
            await AssertProblemAsync(await client.PatchAsJsonAsync($"/api/v1/organizations/{organization.Id}", body, Ct), HttpStatusCode.Forbidden, "organization.forbidden");
        }

        Assert.Equal(organization.Name, (await GetOrganizationAsync(owner, organization.Id)).Name);
    }

    [Fact]
    public async Task Updating_validates_the_fields_and_refuses_a_closed_organisation()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await CreateOrganizationOkAsync(owner);
        var (stranger, _) = await SignedInAsync("stranger", "Stranger");

        await AssertValidationProblemAsync(
            await owner.PatchAsJsonAsync($"/api/v1/organizations/{organization.Id}", new { name = "ab", description = new string('d', 2001) }, Ct),
            "name",
            "description");
        await AssertProblemAsync(
            await stranger.PatchAsJsonAsync($"/api/v1/organizations/{organization.Id}", new { name = "Pris" }, Ct), HttpStatusCode.NotFound, "organization.not_found");

        await SetStatusAsync(organization.Id, OrganizationStatus.Closed);
        await AssertProblemAsync(
            await owner.PatchAsJsonAsync($"/api/v1/organizations/{organization.Id}", new { name = "Rouverte" }, Ct), HttpStatusCode.Conflict, "organization.closed");
    }

    [Fact]
    public async Task My_organisations_lists_my_memberships_in_any_status()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var approved = await ApprovedOrganizationAsync(owner, "B approuvée");
        var other = await ApprovedOrganizationAsync(owner, "C autre");
        var (alice, _) = await SignedInAsync("alice", "Alice");
        var mine = await CreateOrganizationOkAsync(alice, "A à moi");
        var accepted = await AddMemberAsync(owner, approved.Id, alice);
        var declined = await RequestMembershipOkAsync(alice, other.Id);
        await DeclineMembershipAsync(owner, other.Id, declined.Id);

        var list = (await alice.GetFromJsonAsync<List<MyOrganizationResponse>>("/api/v1/me/organizations", Json, Ct))!;

        Assert.Equal(
            [
                (mine.Id, OrganizationStatus.Pending, MembershipRole.Owner, MembershipStatus.Accepted),
                (approved.Id, OrganizationStatus.Approved, MembershipRole.Member, MembershipStatus.Accepted),
                (other.Id, OrganizationStatus.Approved, MembershipRole.Member, MembershipStatus.Declined),
            ],
            list.Select(i => (i.Organization.Id, i.Organization.Status, i.Membership.Role, i.Membership.Status)));
        Assert.Equal(accepted.Id, list[1].Membership.Id);
        Assert.Equal(2, list[1].Organization.MemberCount);
        Assert.Empty((await CreateClient((await SignInDevAsync("nobody", "Nobody")).AccessToken)
            .GetFromJsonAsync<List<MyOrganizationResponse>>("/api/v1/me/organizations", Json, Ct))!);
    }

    private Task SetStatusAsync(Guid organizationId, OrganizationStatus status) => WithDbAsync(db =>
        db.Organizations.Where(o => o.Id == organizationId).ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, status), Ct));
}
