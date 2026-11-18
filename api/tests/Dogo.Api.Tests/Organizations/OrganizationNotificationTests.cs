using System.Net.Http.Json;
using Dogo.Api.Tests.Infrastructure;

namespace Dogo.Api.Tests.Organizations;

/// <summary>Spec §4.4, last row: join request received, membership accepted, organisation approved.</summary>
public sealed class OrganizationNotificationTests(ApiFixture fixture) : OrganizationTestBase(fixture)
{
    [Fact]
    public async Task Approving_an_organisation_notifies_its_owner_once()
    {
        var (owner, session) = await SignedInAsync("owner", "Owner");
        await RegisterDeviceAsync(owner, "owner");
        var organization = await CreateOrganizationOkAsync(owner, "Club canin du lac");

        await ApproveAsync(organization.Id);
        await ApproveAsync(organization.Id);

        var push = Assert.Single(await SentPushesAsync());
        Assert.Equal(session.User.Id, push.UserId);
        Assert.Equal("Organisation validée", push.Title);
        Assert.Equal("« Club canin du lac » est validée : tu peux y proposer des balades.", push.Body);
        Assert.Equal(
            new Dictionary<string, string>
            {
                ["type"] = "organization_approved",
                ["organizationId"] = organization.Id.ToString(),
                ["url"] = $"dogo://organizations/{organization.Id}",
            },
            push.Data);
    }

    [Fact]
    public async Task A_join_request_notifies_the_owner_and_educators()
    {
        var (owner, ownerSession) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner, "Club canin du lac");
        var (educator, educatorSession) = await SignedInAsync("educator", "Educator");
        await AddEducatorAsync(owner, organization.Id, educator);
        var (member, _) = await SignedInAsync("member", "Member");
        await AddMemberAsync(owner, organization.Id, member);
        await RegisterDeviceAsync(owner, "owner");
        await RegisterDeviceAsync(educator, "educator");
        await RegisterDeviceAsync(member, "member");
        await WaitForNotificationsAsync();
        var before = Pushes.Count;
        var (alice, _) = await SignedInAsync("alice", "Alice");

        await RequestMembershipOkAsync(alice, organization.Id);

        var pushes = (await SentPushesAsync()).Skip(before).ToList();
        Assert.Equal(new[] { educatorSession.User.Id, ownerSession.User.Id }.Order(), pushes.Select(p => p.UserId).Order());
        Assert.All(pushes, p =>
        {
            Assert.Equal("membership_requested", p.Data["type"]);
            Assert.Equal("Nouvelle demande d'adhésion", p.Title);
            Assert.Equal("Alice demande à rejoindre « Club canin du lac ».", p.Body);
        });
    }

    [Fact]
    public async Task Accepting_a_request_notifies_the_new_member_only()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner, "Club canin du lac");
        var (alice, aliceSession) = await SignedInAsync("alice", "Alice");
        await RegisterDeviceAsync(alice, "alice");
        var request = await RequestMembershipOkAsync(alice, organization.Id);
        await WaitForNotificationsAsync();
        var before = Pushes.Count;

        await AcceptMembershipAsync(owner, organization.Id, request.Id);
        await AcceptMembershipAsync(owner, organization.Id, request.Id);

        var push = Assert.Single((await SentPushesAsync()).Skip(before));
        Assert.Equal((aliceSession.User.Id, "membership_accepted"), (push.UserId, push.Data["type"]));
        Assert.Equal("Adhésion acceptée", push.Title);
        Assert.Equal("Tu fais maintenant partie de « Club canin du lac ».", push.Body);
    }

    [Fact]
    public async Task Declining_a_request_notifies_no_one()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var (alice, _) = await SignedInAsync("alice", "Alice");
        await RegisterDeviceAsync(alice, "alice");
        var request = await RequestMembershipOkAsync(alice, organization.Id);
        await WaitForNotificationsAsync();
        var before = Pushes.Count;

        await DeclineMembershipAsync(owner, organization.Id, request.Id);

        Assert.Empty((await SentPushesAsync()).Skip(before));
    }

    [Fact]
    public async Task Organisation_notifications_follow_the_registrations_preference()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        await RegisterDeviceAsync(owner, "owner");
        await owner.PutAsJsonAsync(
            "/api/v1/me/notification-preferences", new { registrations = false, walkChanges = true, messages = true, reminders = true }, Ct);
        var organization = await ApprovedOrganizationAsync(owner);
        var (alice, _) = await SignedInAsync("alice", "Alice");

        await RequestMembershipOkAsync(alice, organization.Id);

        Assert.Empty(await SentPushesAsync());
    }
}
