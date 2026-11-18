using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Admin;
using Dogo.Api.Features.Auth;
using Dogo.Api.Features.Organizations;
using Dogo.Api.Features.Reports;
using Dogo.Api.Features.Users;
using Dogo.Api.Tests.Infrastructure;
using Dogo.Api.Tests.Organizations;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Admin;

/// <summary>Spec §4.7: administrators (Admin:Emails) approve organisations, handle reports, suspend accounts.</summary>
public sealed class AdminTests(ApiFixture fixture) : OrganizationTestBase(fixture)
{
    public static TheoryData<string, string> AdminEndpoints => new()
    {
        { "GET", "/api/v1/admin/organizations" },
        { "POST", $"/api/v1/admin/organizations/{Guid.NewGuid()}/approve" },
        { "POST", $"/api/v1/admin/organizations/{Guid.NewGuid()}/reject" },
        { "GET", "/api/v1/admin/reports" },
        { "PATCH", $"/api/v1/admin/reports/{Guid.NewGuid()}" },
        { "POST", $"/api/v1/admin/users/{Guid.NewGuid()}/suspend" },
        { "POST", $"/api/v1/admin/users/{Guid.NewGuid()}/unsuspend" },
    };

    [Theory]
    [MemberData(nameof(AdminEndpoints))]
    public async Task Every_admin_endpoint_is_refused_to_other_users(string method, string url)
    {
        var (client, _) = await SignedInAsync("alice", "Alice");
        var (withOtherEmail, _) = (CreateClient((await SignInDevAsync("bob", "Bob", "bob@dogo.test")).AccessToken), 0);

        foreach (var user in new[] { client, withOtherEmail })
        {
            var request = new HttpRequestMessage(new HttpMethod(method), url);
            if (method != "GET")
            {
                request.Content = JsonContent.Create(new { status = "Closed" });
            }

            await AssertProblemAsync(await user.SendAsync(request, Ct), HttpStatusCode.Forbidden, "admin.forbidden");
        }
    }

    [Fact]
    public async Task Admin_endpoints_require_authentication()
    {
        await AssertProblemAsync(await CreateClient().GetAsync("/api/v1/admin/reports", Ct), HttpStatusCode.Unauthorized, "auth.unauthenticated");
    }

    [Fact]
    public async Task An_account_whose_verified_email_is_configured_is_an_administrator()
    {
        var signIn = await CreateClient().PostAsJsonAsync(
            "/api/v1/auth/google", new { idToken = FakeIdentityTokenValidator.Token("google-admin", "ADMIN@dogo.test", "Admin") }, Ct);
        var session = (await signIn.Content.ReadFromJsonAsync<SessionResponse>(Json, Ct))!;

        Assert.True(session.User.IsAdmin);
        Assert.Equal(HttpStatusCode.OK, (await CreateClient(session.AccessToken).GetAsync("/api/v1/admin/reports", Ct)).StatusCode);
    }

    [Fact]
    public async Task Removing_an_email_from_the_configuration_takes_effect_at_once()
    {
        var (admin, _) = await AdminAsync();
        await using var factory = new DogoApiFactory(Fixture.ConnectionString, new Dictionary<string, string?> { ["Admin:Emails:0"] = "someone-else@dogo.test" });
        var session = (await (await factory.CreateClient().PostAsJsonAsync(
            "/api/v1/auth/dev", new { subject = "admin", displayName = "Admin" }, Ct)).Content.ReadFromJsonAsync<SessionResponse>(Json, Ct))!;
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new("Bearer", session.AccessToken);

        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/v1/admin/reports", Ct)).StatusCode);
        await AssertProblemAsync(await client.GetAsync("/api/v1/admin/reports", Ct), HttpStatusCode.Forbidden, "admin.forbidden");
    }

    [Fact]
    public async Task Listing_organisations_shows_pending_ones_by_default_oldest_first()
    {
        var (owner, ownerSession) = await SignedInAsync("owner", "Owner");
        var first = await CreateOrganizationOkAsync(owner, "Premier");
        var second = await CreateOrganizationOkAsync(owner, "Second");
        var approved = await ApprovedOrganizationAsync(owner, "Validée");
        var (admin, _) = await AdminAsync();

        var pending = (await admin.GetFromJsonAsync<List<AdminOrganizationResponse>>("/api/v1/admin/organizations", Json, Ct))!;
        var approvedList = (await admin.GetFromJsonAsync<List<AdminOrganizationResponse>>("/api/v1/admin/organizations?status=Approved", Json, Ct))!;

        Assert.Equal([first.Id, second.Id], pending.Select(o => o.Id));
        Assert.Equal((ownerSession.User.Id, 1, OrganizationStatus.Pending), (pending[0].CreatedBy!.Id, pending[0].MemberCount, pending[0].Status));
        Assert.Equal([approved.Id], approvedList.Select(o => o.Id));
        await AssertValidationProblemAsync(await admin.GetAsync("/api/v1/admin/organizations?limit=101", Ct), "limit");
        await AssertProblemAsync(await admin.GetAsync("/api/v1/admin/organizations?status=Unknown", Ct), HttpStatusCode.BadRequest, "request.invalid");
    }

    [Fact]
    public async Task Approving_makes_an_organisation_visible_and_rejecting_hides_it()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await CreateOrganizationOkAsync(owner);
        var (admin, _) = await AdminAsync();
        var (stranger, _) = await SignedInAsync("stranger", "Stranger");

        var approved = await admin.PostAsync($"/api/v1/admin/organizations/{organization.Id}/approve", null, Ct);
        Assert.Equal(HttpStatusCode.OK, approved.StatusCode);
        Assert.Equal(OrganizationStatus.Approved, (await approved.Content.ReadFromJsonAsync<AdminOrganizationResponse>(Json, Ct))!.Status);
        Assert.Equal(OrganizationStatus.Approved, (await GetOrganizationAsync(stranger, organization.Id)).Status);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/v1/admin/organizations/{organization.Id}/approve", null, Ct)).StatusCode);

        var rejected = await admin.PostAsync($"/api/v1/admin/organizations/{organization.Id}/reject", null, Ct);
        Assert.Equal(OrganizationStatus.Rejected, (await rejected.Content.ReadFromJsonAsync<AdminOrganizationResponse>(Json, Ct))!.Status);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync($"/api/v1/organizations/{organization.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/v1/admin/organizations/{organization.Id}/reject", null, Ct)).StatusCode);
    }

    [Fact]
    public async Task A_closed_or_unknown_organisation_cannot_be_decided_on()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var organization = await CreateOrganizationOkAsync(owner);
        await WithDbAsync(db => db.Organizations.ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, OrganizationStatus.Closed), Ct));
        var (admin, _) = await AdminAsync();

        await AssertProblemAsync(await admin.PostAsync($"/api/v1/admin/organizations/{organization.Id}/approve", null, Ct), HttpStatusCode.Conflict, "organization.closed");
        await AssertProblemAsync(await admin.PostAsync($"/api/v1/admin/organizations/{organization.Id}/reject", null, Ct), HttpStatusCode.Conflict, "organization.closed");
        await AssertProblemAsync(await admin.PostAsync($"/api/v1/admin/organizations/{Guid.NewGuid()}/approve", null, Ct), HttpStatusCode.NotFound, "organization.not_found");
    }

    [Fact]
    public async Task Listing_reports_shows_open_ones_with_the_reporter_and_targets()
    {
        var (me, session) = await SignedInAsync("me", "Me");
        var (bob, bobId, dog) = await DogOwnerAsync("bob");
        var walk = await CreateWalkAsync(bob, ("title", "Tour du lac"));
        await me.PostAsJsonAsync("/api/v1/reports", new { type = "Altercation", facts = "Bagarre au portail.", targetUserId = bobId, targetDogId = dog.Id, walkId = walk.Id }, Ct);
        await me.PostAsJsonAsync("/api/v1/reports", new { type = "HumanBehavior", facts = "Propos insultants.", targetUserId = bobId }, Ct);
        var closedId = await WithDbAsync(db => db.Reports.OrderBy(r => r.CreatedAt).Select(r => r.Id).LastAsync(Ct));
        await WithDbAsync(db => db.Reports.Where(r => r.Id == closedId).ExecuteUpdateAsync(s => s.SetProperty(r => r.Status, ReportStatus.Closed), Ct));
        var (admin, _) = await AdminAsync();

        var open = (await admin.GetFromJsonAsync<List<AdminReportResponse>>("/api/v1/admin/reports", Json, Ct))!;
        var closed = (await admin.GetFromJsonAsync<List<AdminReportResponse>>("/api/v1/admin/reports?status=Closed", Json, Ct))!;

        var report = Assert.Single(open);
        Assert.Equal((ReportType.Altercation, "Bagarre au portail.", ReportStatus.Open), (report.Type, report.Facts, report.Status));
        Assert.Equal((session.User.Id, "Me"), (report.Reporter!.Id, report.Reporter.DisplayName));
        Assert.Equal(bobId, report.TargetUser!.Id);
        Assert.Equal(new ReportDogResponse(dog.Id, dog.Name, bobId), report.TargetDog);
        Assert.Equal(new ReportWalkResponse(walk.Id, "Tour du lac", walk.StartsAt), report.Walk);
        Assert.Equal([closedId], closed.Select(r => r.Id));
        Assert.Null(closed[0].TargetDog);
    }

    [Fact]
    public async Task An_administrator_classifies_a_report()
    {
        var (me, _) = await SignedInAsync("me", "Me");
        var (_, bobId, _) = await DogOwnerAsync("bob");
        var created = await me.PostAsJsonAsync("/api/v1/reports", new { type = "HumanBehavior", facts = "Propos insultants.", targetUserId = bobId }, Ct);
        var reportId = (await ReadJsonAsync(created)).GetProperty("id").GetGuid();
        var (admin, _) = await AdminAsync();

        var reviewed = await admin.PatchAsJsonAsync($"/api/v1/admin/reports/{reportId}", new { status = "Reviewed", adminNote = "  Appelé les deux parties.  " }, Ct);
        var noteOnly = await admin.PatchAsJsonAsync($"/api/v1/admin/reports/{reportId}", new { adminNote = "Clos après échange." }, Ct);

        Assert.Equal(HttpStatusCode.OK, reviewed.StatusCode);
        Assert.Equal((ReportStatus.Reviewed, "Appelé les deux parties."), Pick(await reviewed.Content.ReadFromJsonAsync<AdminReportResponse>(Json, Ct)));
        Assert.Equal((ReportStatus.Reviewed, "Clos après échange."), Pick(await noteOnly.Content.ReadFromJsonAsync<AdminReportResponse>(Json, Ct)));
        var cleared = await admin.PatchAsJsonAsync($"/api/v1/admin/reports/{reportId}", new { status = "Closed", adminNote = "" }, Ct);
        Assert.Equal((ReportStatus.Closed, (string?)null), Pick(await cleared.Content.ReadFromJsonAsync<AdminReportResponse>(Json, Ct)));
        var stored = await WithDbAsync(db => db.Reports.SingleAsync(Ct));
        Assert.Equal((ReportStatus.Closed, (string?)null), (stored.Status, stored.AdminNote));

        await AssertProblemAsync(await admin.PatchAsJsonAsync($"/api/v1/admin/reports/{Guid.NewGuid()}", new { status = "Closed" }, Ct), HttpStatusCode.NotFound, "report.not_found");
        await AssertValidationProblemAsync(await admin.PatchAsJsonAsync($"/api/v1/admin/reports/{reportId}", new { adminNote = new string('n', 2001) }, Ct), "adminNote");
        await AssertValidationProblemAsync(await admin.PatchAsJsonAsync($"/api/v1/admin/reports/{reportId}", new { status = "Forgotten" }, Ct), "status");

        static (ReportStatus, string?) Pick(AdminReportResponse? report) => (report!.Status, report.AdminNote);
    }

    [Fact]
    public async Task Suspending_refuses_writes_revokes_sessions_and_keeps_reads()
    {
        var (bob, bobSession) = await SignedInAsync("bob", "Bob");
        var (admin, _) = await AdminAsync();

        var response = await admin.PostAsync($"/api/v1/admin/users/{bobSession.User.Id}/suspend", null, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(new AdminUserResponse(bobSession.User.Id, "Bob", UserStatus.Suspended), await response.Content.ReadFromJsonAsync<AdminUserResponse>(Json, Ct));
        await AssertProblemAsync(await bob.PostAsJsonAsync("/api/v1/dogs", ValidDog(), Ct), HttpStatusCode.Forbidden, "account.suspended");
        Assert.Equal(HttpStatusCode.OK, (await bob.GetAsync("/api/v1/me", Ct)).StatusCode);
        await AssertProblemAsync(
            await CreateClient().PostAsJsonAsync("/api/v1/auth/refresh", new { refreshToken = bobSession.RefreshToken }, Ct), HttpStatusCode.Unauthorized, "auth.invalid_token");
        await AssertProblemAsync(
            await CreateClient().PostAsJsonAsync("/api/v1/auth/dev", new { subject = "bob", displayName = "Bob" }, Ct), HttpStatusCode.Forbidden, "account.suspended");
        Assert.Equal(0, await WithDbAsync(db => db.RefreshTokens.CountAsync(t => t.UserId == bobSession.User.Id && t.RevokedAt == null, Ct)));

        // Idempotent.
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/v1/admin/users/{bobSession.User.Id}/suspend", null, Ct)).StatusCode);
    }

    [Fact]
    public async Task Unsuspending_restores_the_account()
    {
        var (bob, bobSession) = await SignedInAsync("bob", "Bob");
        var (admin, _) = await AdminAsync();
        await admin.PostAsync($"/api/v1/admin/users/{bobSession.User.Id}/suspend", null, Ct);

        var response = await admin.PostAsync($"/api/v1/admin/users/{bobSession.User.Id}/unsuspend", null, Ct);

        Assert.Equal(UserStatus.Active, (await response.Content.ReadFromJsonAsync<AdminUserResponse>(Json, Ct))!.Status);
        Assert.Equal(HttpStatusCode.Created, (await bob.PostAsJsonAsync("/api/v1/dogs", ValidDog(), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await CreateClient().PostAsJsonAsync("/api/v1/auth/dev", new { subject = "bob", displayName = "Bob" }, Ct)).StatusCode);
    }

    [Fact]
    public async Task An_administrator_cannot_suspend_themselves_nor_an_unknown_user()
    {
        var (admin, session) = await AdminAsync();

        await AssertProblemAsync(await admin.PostAsync($"/api/v1/admin/users/{session.User.Id}/suspend", null, Ct), HttpStatusCode.Conflict, "admin.self_suspension");
        await AssertProblemAsync(await admin.PostAsync($"/api/v1/admin/users/{Guid.NewGuid()}/suspend", null, Ct), HttpStatusCode.NotFound, "user.not_found");
        await AssertProblemAsync(await admin.PostAsync($"/api/v1/admin/users/{Guid.NewGuid()}/unsuspend", null, Ct), HttpStatusCode.NotFound, "user.not_found");
        Assert.Equal(UserStatus.Active, await WithDbAsync(db => db.Users.Where(u => u.Id == session.User.Id).Select(u => u.Status).SingleAsync(Ct)));
    }
}
