using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Organizations;
using Dogo.Api.Tests.Infrastructure;
using Dogo.Api.Tests.Walks;

namespace Dogo.Api.Tests.Organizations;

/// <summary>Helpers shared by the organisation, membership and professional walk tests.</summary>
public abstract class OrganizationTestBase(ApiFixture fixture) : WalkTestBase(fixture)
{
    protected static Task<HttpResponseMessage> CreateOrganizationAsync(HttpClient client, object body) =>
        client.PostAsJsonAsync("/api/v1/organizations", body, Ct);

    /// <summary>Creates a <c>Pending</c> organisation owned by the client's user.</summary>
    protected static async Task<OrganizationDetailResponse> CreateOrganizationOkAsync(
        HttpClient client, string name = "Club canin du lac", string? city = "Annecy", string? description = "Éducation positive.")
    {
        var response = await CreateOrganizationAsync(client, new { name, city, description });
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync(Ct));
        return (await response.Content.ReadFromJsonAsync<OrganizationDetailResponse>(Json, Ct))!;
    }

    protected async Task ApproveAsync(Guid organizationId)
    {
        var (admin, _) = await AdminAsync();
        var response = await admin.PostAsync($"/api/v1/admin/organizations/{organizationId}/approve", null, Ct);
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
    }

    /// <summary>Creates and approves an organisation owned by the client's user.</summary>
    protected async Task<OrganizationDetailResponse> ApprovedOrganizationAsync(HttpClient owner, string name = "Club canin du lac", string? city = "Annecy")
    {
        var organization = await CreateOrganizationOkAsync(owner, name, city);
        await ApproveAsync(organization.Id);
        await WaitForNotificationsAsync();
        return organization;
    }

    protected static async Task<OrganizationDetailResponse> GetOrganizationAsync(HttpClient client, Guid id) =>
        (await client.GetFromJsonAsync<OrganizationDetailResponse>($"/api/v1/organizations/{id}", Json, Ct))!;

    protected static Task<HttpResponseMessage> RequestMembershipAsync(HttpClient client, Guid organizationId) =>
        client.PostAsync($"/api/v1/organizations/{organizationId}/memberships", null, Ct);

    protected static async Task<MembershipResponse> RequestMembershipOkAsync(HttpClient client, Guid organizationId)
    {
        var response = await RequestMembershipAsync(client, organizationId);
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync(Ct));
        return (await response.Content.ReadFromJsonAsync<MembershipResponse>(Json, Ct))!;
    }

    protected static Task<HttpResponseMessage> AcceptMembershipAsync(HttpClient client, Guid organizationId, Guid membershipId) =>
        client.PostAsync($"/api/v1/organizations/{organizationId}/memberships/{membershipId}/accept", null, Ct);

    protected static Task<HttpResponseMessage> DeclineMembershipAsync(HttpClient client, Guid organizationId, Guid membershipId) =>
        client.PostAsync($"/api/v1/organizations/{organizationId}/memberships/{membershipId}/decline", null, Ct);

    protected static Task<HttpResponseMessage> SetRoleAsync(HttpClient client, Guid organizationId, Guid membershipId, string role) =>
        client.PatchAsJsonAsync($"/api/v1/organizations/{organizationId}/memberships/{membershipId}", new { role }, Ct);

    protected static Task<HttpResponseMessage> DeleteMembershipAsync(HttpClient client, Guid organizationId, Guid membershipId) =>
        client.DeleteAsync($"/api/v1/organizations/{organizationId}/memberships/{membershipId}", Ct);

    /// <summary><paramref name="member"/> asks to join and <paramref name="manager"/> accepts; returns the membership.</summary>
    protected static async Task<MembershipResponse> AddMemberAsync(HttpClient manager, Guid organizationId, HttpClient member)
    {
        var request = await RequestMembershipOkAsync(member, organizationId);
        var response = await AcceptMembershipAsync(manager, organizationId, request.Id);
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
        return (await response.Content.ReadFromJsonAsync<MembershipResponse>(Json, Ct))!;
    }

    /// <summary>Adds <paramref name="educator"/> as an accepted member, then the owner makes them an educator.</summary>
    protected static async Task<MembershipResponse> AddEducatorAsync(HttpClient owner, Guid organizationId, HttpClient educator)
    {
        var membership = await AddMemberAsync(owner, organizationId, educator);
        var response = await SetRoleAsync(owner, organizationId, membership.Id, "Educator");
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
        return (await response.Content.ReadFromJsonAsync<MembershipResponse>(Json, Ct))!;
    }
}
