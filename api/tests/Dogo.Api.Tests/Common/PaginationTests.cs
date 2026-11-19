using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Dogo.Api.Features.Blocks;
using Dogo.Api.Features.Organizations;
using Dogo.Api.Features.Reports;
using Dogo.Api.Features.Users;
using Dogo.Api.Tests.Infrastructure;
using Dogo.Api.Tests.Organizations;

namespace Dogo.Api.Tests.Common;

/// <summary>Spec §1: every list takes <c>limit</c>, 50 by default and 100 at most.</summary>
public sealed class PaginationTests(ApiFixture fixture) : OrganizationTestBase(fixture)
{
    private const int MoreThanDefault = 51;

    /// <summary>Accounts written straight to the database (faster than signing each one in).</summary>
    private async Task<List<Guid>> BulkUsersAsync(int count) =>
        await WithDbAsync(async db =>
        {
            var users = Enumerable.Range(0, count)
                .Select(i => new User { Provider = IdentityProvider.Dev, ProviderSubject = $"bulk{i}", DisplayName = $"Bulk {i:D3}" })
                .ToList();
            db.Users.AddRange(users);
            await db.SaveChangesAsync(Ct);
            return users.Select(u => u.Id).ToList();
        });

    private static async Task<int> CountAsync(HttpClient client, string url, string? property = null)
    {
        var response = await client.GetAsync(url, Ct);
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
        var json = await response.Content.ReadFromJsonAsync<JsonElement>(Json, Ct);
        return (property is null ? json : json.GetProperty(property)).GetArrayLength();
    }

    private static async Task AssertLimitIsValidatedAsync(HttpClient client, string url)
    {
        var separator = url.Contains('?') ? '&' : '?';
        await AssertValidationProblemAsync(await client.GetAsync($"{url}{separator}limit=0", Ct), "limit");
        await AssertValidationProblemAsync(await client.GetAsync($"{url}{separator}limit=101", Ct), "limit");
    }

    [Fact]
    public async Task Walk_lists_return_fifty_by_default()
    {
        var (client, _) = await SignedInAsync();
        for (var i = 0; i < MoreThanDefault; i++)
        {
            await CreateWalkAsync(client, ("startsAt", Tomorrow.AddMinutes(i)));
        }

        var search = $"/api/v1/walks?lat={ParisLatitude}&lng={ParisLongitude}";
        Assert.Equal(50, await CountAsync(client, search));
        Assert.Equal(50, await CountAsync(client, "/api/v1/me/walks?role=Organizer"));
        Assert.Equal(MoreThanDefault, await CountAsync(client, $"{search}&limit=100"));
        Assert.Equal(3, await CountAsync(client, $"{search}&limit=3"));
    }

    [Fact]
    public async Task My_blocks_take_a_limit_fifty_by_default()
    {
        var (client, session) = await SignedInAsync();
        var users = await BulkUsersAsync(MoreThanDefault);
        await WithDbAsync(async db =>
        {
            db.Blocks.AddRange(users.Select(u => new Block { BlockerId = session.User.Id, BlockedId = u }));
            await db.SaveChangesAsync(Ct);
        });

        Assert.Equal(50, await CountAsync(client, "/api/v1/me/blocks"));
        Assert.Equal(2, await CountAsync(client, "/api/v1/me/blocks?limit=2"));
        Assert.Equal(MoreThanDefault, await CountAsync(client, "/api/v1/me/blocks?limit=100"));
        await AssertLimitIsValidatedAsync(client, "/api/v1/me/blocks");
    }

    [Fact]
    public async Task My_organisations_take_a_limit_fifty_by_default()
    {
        var (client, session) = await SignedInAsync();
        await WithDbAsync(async db =>
        {
            for (var i = 0; i < MoreThanDefault; i++)
            {
                var organization = new Organization { Name = $"Club {i:D3}", Status = OrganizationStatus.Approved };
                db.Organizations.Add(organization);
                db.Memberships.Add(new Membership
                {
                    OrganizationId = organization.Id, UserId = session.User.Id, Role = MembershipRole.Member, Status = MembershipStatus.Accepted,
                });
            }

            await db.SaveChangesAsync(Ct);
        });

        Assert.Equal(50, await CountAsync(client, "/api/v1/me/organizations"));
        Assert.Equal(1, await CountAsync(client, "/api/v1/me/organizations?limit=1"));
        await AssertLimitIsValidatedAsync(client, "/api/v1/me/organizations");
    }

    [Fact]
    public async Task Admin_lists_take_a_limit_fifty_by_default()
    {
        var (admin, _) = await AdminAsync();
        var users = await BulkUsersAsync(1);
        await WithDbAsync(async db =>
        {
            for (var i = 0; i < MoreThanDefault; i++)
            {
                db.Organizations.Add(new Organization { Name = $"Club {i:D3}" });
                db.Reports.Add(new Report { TargetUserId = users[0], Type = ReportType.HumanBehavior, Facts = "Des faits assez longs." });
            }

            await db.SaveChangesAsync(Ct);
        });

        Assert.Equal(50, await CountAsync(admin, "/api/v1/admin/organizations"));
        Assert.Equal(4, await CountAsync(admin, "/api/v1/admin/organizations?limit=4"));
        Assert.Equal(50, await CountAsync(admin, "/api/v1/admin/reports"));
        Assert.Equal(4, await CountAsync(admin, "/api/v1/admin/reports?limit=4"));
        await AssertLimitIsValidatedAsync(admin, "/api/v1/admin/organizations");
        await AssertLimitIsValidatedAsync(admin, "/api/v1/admin/reports");
    }

    [Fact]
    public async Task Member_lists_take_a_limit_per_list_fifty_by_default()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var members = await BulkUsersAsync(MoreThanDefault);
        await WithDbAsync(async db =>
        {
            foreach (var (user, index) in members.Select((u, i) => (u, i)))
            {
                db.Memberships.Add(new Membership
                {
                    OrganizationId = organization.Id,
                    UserId = user,
                    Role = MembershipRole.Member,
                    Status = index < 30 ? MembershipStatus.Accepted : MembershipStatus.Pending,
                });
            }

            await db.SaveChangesAsync(Ct);
        });
        var url = $"/api/v1/organizations/{organization.Id}/memberships";

        // 31 accepted (owner included) and 21 requests: each list is limited on its own.
        Assert.Equal(31, await CountAsync(owner, url, "members"));
        Assert.Equal(21, await CountAsync(owner, url, "requests"));
        Assert.Equal(5, await CountAsync(owner, $"{url}?limit=5", "members"));
        Assert.Equal(5, await CountAsync(owner, $"{url}?limit=5", "requests"));
        await AssertLimitIsValidatedAsync(owner, url);
    }

    [Fact]
    public async Task The_member_list_defaults_to_fifty()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await ApprovedOrganizationAsync(owner);
        var members = await BulkUsersAsync(MoreThanDefault);
        await WithDbAsync(async db =>
        {
            db.Memberships.AddRange(members.Select(u => new Membership
            {
                OrganizationId = organization.Id, UserId = u, Role = MembershipRole.Member, Status = MembershipStatus.Accepted,
            }));
            await db.SaveChangesAsync(Ct);
        });
        var url = $"/api/v1/organizations/{organization.Id}/memberships";

        Assert.Equal(50, await CountAsync(owner, url, "members"));
        Assert.Equal(MoreThanDefault + 1, await CountAsync(owner, $"{url}?limit=100", "members"));
    }
}
