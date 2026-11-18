using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Walks;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Organizations;

/// <summary>Spec §4.6 and §4.3: professional walks, created by owners and educators, reserved to members.</summary>
public sealed class ProfessionalWalkTests(ApiFixture fixture) : OrganizationTestBase(fixture)
{
    [Fact]
    public async Task The_owner_creates_a_professional_walk_shown_as_such_everywhere()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner, "Club canin du lac");
        var expected = new WalkOrganizationResponse(organization.Id, "Club canin du lac");

        var walk = await CreateWalkAsync(owner, ("organizationId", organization.Id));

        Assert.True(walk.IsProfessional);
        Assert.Equal(expected, walk.Organization);
        var (stranger, _) = await SignedInAsync("stranger", "Stranger");
        var detail = await GetWalkAsync(stranger, walk.Id);
        Assert.Equal((true, expected), (detail.IsProfessional, detail.Organization));
        var found = Assert.Single((await stranger.GetFromJsonAsync<List<WalkSearchResult>>($"/api/v1/walks?lat={ParisLatitude}&lng={ParisLongitude}", Json, Ct))!);
        Assert.Equal((true, expected), (found.IsProfessional, found.Organization));
        var mine = Assert.Single((await owner.GetFromJsonAsync<List<MyWalkResponse>>("/api/v1/me/walks?role=Organizer", Json, Ct))!);
        Assert.Equal((true, expected), (mine.IsProfessional, mine.Organization));
        Assert.Equal(organization.Id, await WithDbAsync(db => db.Walks.Select(w => w.OrganizationId).SingleAsync(Ct)));
    }

    [Fact]
    public async Task A_personal_walk_is_not_professional()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");

        var walk = await CreateWalkAsync(owner);

        Assert.False(walk.IsProfessional);
        Assert.Null(walk.Organization);
    }

    [Fact]
    public async Task An_educator_creates_a_professional_walk()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var (educator, _) = await SignedInAsync("educator", "Educator");
        await AddEducatorAsync(owner, organization.Id, educator);

        var walk = await CreateWalkAsync(educator, ("organizationId", organization.Id));

        Assert.True(walk.IsProfessional);
    }

    [Fact]
    public async Task Members_strangers_and_unknown_organisations_cannot_carry_a_walk()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var (member, _) = await SignedInAsync("member", "Member");
        await AddMemberAsync(owner, organization.Id, member);
        var (pending, _) = await SignedInAsync("pending", "Pending");
        await RequestMembershipOkAsync(pending, organization.Id);
        var (stranger, _) = await SignedInAsync("stranger", "Stranger");

        foreach (var client in new[] { member, pending, stranger })
        {
            var response = await client.PostAsJsonAsync("/api/v1/walks", ValidWalk(("organizationId", organization.Id)), Ct);
            await AssertProblemAsync(response, HttpStatusCode.Forbidden, "walk.organization_forbidden");
        }

        await AssertProblemAsync(
            await owner.PostAsJsonAsync("/api/v1/walks", ValidWalk(("organizationId", Guid.NewGuid())), Ct), HttpStatusCode.Forbidden, "walk.organization_forbidden");
        Assert.Equal(0, await WithDbAsync(db => db.Walks.CountAsync(Ct)));
    }

    [Theory]
    [InlineData("Pending")]
    [InlineData("Rejected")]
    [InlineData("Closed")]
    public async Task Only_an_approved_organisation_carries_walks(string status)
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await CreateOrganizationOkAsync(owner);
        await WithDbAsync(db => db.Organizations.Where(o => o.Id == organization.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, Enum.Parse<Dogo.Api.Features.Organizations.OrganizationStatus>(status)), Ct));

        var response = await owner.PostAsJsonAsync("/api/v1/walks", ValidWalk(("organizationId", organization.Id)), Ct);

        await AssertProblemAsync(response, HttpStatusCode.Forbidden, "walk.organization_forbidden");
    }

    [Fact]
    public async Task Only_accepted_members_register_to_a_professional_walk()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var walk = await CreateWalkAsync(owner, ("organizationId", organization.Id));
        var (stranger, _, strangerDog) = await DogOwnerAsync("stranger");
        var (pending, _, pendingDog) = await DogOwnerAsync("pending");
        await RequestMembershipOkAsync(pending, organization.Id);
        var (member, _, memberDog) = await DogOwnerAsync("member");
        await AddMemberAsync(owner, organization.Id, member);

        await AssertProblemAsync(await RegisterAsync(stranger, walk.Id, strangerDog.Id), HttpStatusCode.Forbidden, "walk.members_only");
        await AssertProblemAsync(await RegisterAsync(pending, walk.Id, pendingDog.Id), HttpStatusCode.Forbidden, "walk.members_only");
        var registration = Assert.Single(await RegisterOkAsync(member, walk.Id, memberDog.Id));

        Assert.Equal(RegistrationStatus.Accepted, registration.Status);
        Assert.Equal(1, await WithDbAsync(db => db.Registrations.CountAsync(Ct)));
    }

    [Fact]
    public async Task Educators_and_the_organizer_register_their_dogs_to_a_professional_walk()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var (educator, _, educatorDog) = await DogOwnerAsync("educator");
        await AddEducatorAsync(owner, organization.Id, educator);
        var walk = await CreateWalkAsync(educator, ("organizationId", organization.Id));
        var ownerDog = await CreateDogAsync(owner);

        await RegisterOkAsync(educator, walk.Id, educatorDog.Id);
        await RegisterOkAsync(owner, walk.Id, ownerDog.Id);

        Assert.Equal(2, (await GetWalkAsync(owner, walk.Id)).AcceptedDogsCount);
    }

    [Fact]
    public async Task A_member_who_left_can_no_longer_register()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var walk = await CreateWalkAsync(owner, ("organizationId", organization.Id));
        var (member, _, dog) = await DogOwnerAsync("member");
        var membership = await AddMemberAsync(owner, organization.Id, member);
        await DeleteMembershipAsync(member, organization.Id, membership.Id);

        await AssertProblemAsync(await RegisterAsync(member, walk.Id, dog.Id), HttpStatusCode.Forbidden, "walk.members_only");
    }

    [Fact]
    public async Task Updating_a_walk_cannot_change_its_organisation()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var first = await ApprovedOrganizationAsync(owner, "Premier club");
        var second = await ApprovedOrganizationAsync(owner, "Second club");
        var professional = await CreateWalkAsync(owner, ("organizationId", first.Id));
        var personal = await CreateWalkAsync(owner);

        var moved = await owner.PatchAsJsonAsync($"/api/v1/walks/{professional.Id}", new { organizationId = second.Id, title = "Renommée" }, Ct);
        var attached = await owner.PatchAsJsonAsync($"/api/v1/walks/{personal.Id}", new { organizationId = second.Id }, Ct);

        Assert.Equal(HttpStatusCode.OK, moved.StatusCode);
        Assert.Equal(HttpStatusCode.OK, attached.StatusCode);
        Assert.Equal(first.Id, (await GetWalkAsync(owner, professional.Id)).Organization!.Id);
        Assert.False((await GetWalkAsync(owner, personal.Id)).IsProfessional);
    }

    [Fact]
    public async Task The_next_walk_of_a_weekly_series_stays_professional()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var walk = await CreateWalkAsync(owner, ("organizationId", organization.Id), ("repeatWeekly", true));

        Assert.Equal(1, await RunSeriesJobAsync(walk.StartsAt.AddMinutes(1)));

        var next = await WithDbAsync(db => db.Walks.AsNoTracking().Where(w => w.Id != walk.Id).SingleAsync(Ct));
        Assert.Equal(organization.Id, next.OrganizationId);
    }
}
