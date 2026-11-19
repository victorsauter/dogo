using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Reports;
using Dogo.Api.Infrastructure.Auth;
using Dogo.Api.Tests.Infrastructure;
using Dogo.Api.Tests.Walks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Tests.Reports;

/// <summary>Spec §4.7: reporting a person, a dog or a walk; reports are only for administrators.</summary>
public sealed class ReportTests(ApiFixture fixture) : WalkTestBase(fixture)
{
    private static Task<HttpResponseMessage> ReportAsync(HttpClient client, object body) =>
        client.PostAsJsonAsync("/api/v1/reports", body, Ct);

    [Fact]
    public async Task A_report_is_stored_acknowledged_and_sent_to_the_administration()
    {
        var (me, session) = await SignedInAsync("me", "Me");
        var (bob, bobId, dog) = await DogOwnerAsync("bob");
        var walk = await CreateWalkAsync(bob);

        var response = await ReportAsync(me, new
        {
            type = "Altercation",
            facts = "  Son chien a attaqué le mien au portail.  ",
            targetUserId = bobId,
            targetDogId = dog.Id,
            walkId = walk.Id,
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.Equal(["id", "createdAt"], body.EnumerateObject().Select(p => p.Name));
        var report = await WithDbAsync(db => db.Reports.SingleAsync(Ct));
        Assert.Equal(body.GetProperty("id").GetGuid(), report.Id);
        Assert.Equal(body.GetProperty("createdAt").GetDateTimeOffset(), report.CreatedAt);
        Assert.Equal((session.User.Id, bobId, dog.Id, walk.Id), (report.ReporterId, report.TargetUserId, report.TargetDogId, report.WalkId));
        Assert.Equal((ReportType.Altercation, "Son chien a attaqué le mien au portail.", ReportStatus.Open, (string?)null), (report.Type, report.Facts, report.Status, report.AdminNote));
        Assert.Equal([report.Id], Factory.ReportNotifier.Reported);
    }

    [Theory]
    [InlineData("user")]
    [InlineData("dog")]
    [InlineData("walk")]
    public async Task A_single_target_is_enough(string target)
    {
        var (me, _) = await SignedInAsync("me", "Me");
        var (bob, bobId, dog) = await DogOwnerAsync("bob");
        var walk = await CreateWalkAsync(bob);
        object body = target switch
        {
            "user" => new { type = "HumanBehavior", facts = "Propos insultants.", targetUserId = bobId },
            "dog" => new { type = "BiteOrInjury", facts = "Morsure à la main.", targetDogId = dog.Id },
            _ => new { type = "IncidentNoInjury", facts = "Chiens détachés partout.", walkId = walk.Id },
        };

        Assert.Equal(HttpStatusCode.Created, (await ReportAsync(me, body)).StatusCode);
    }

    [Fact]
    public async Task A_report_needs_a_target_type_and_facts()
    {
        var (me, _) = await SignedInAsync("me", "Me");
        var (_, bobId, _) = await DogOwnerAsync("bob");

        await AssertValidationProblemAsync(await ReportAsync(me, new { type = "Altercation", facts = "Il s'est passé quelque chose." }), "target");
        await AssertValidationProblemAsync(await ReportAsync(me, new { type = "Altercation", facts = "  court  ", targetUserId = bobId }), "facts");
        await AssertValidationProblemAsync(await ReportAsync(me, new { type = "Altercation", facts = new string('f', 4001), targetUserId = bobId }), "facts");
        await AssertValidationProblemAsync(await ReportAsync(me, new { facts = "Il s'est passé quelque chose.", targetUserId = bobId }), "type");
        await AssertValidationProblemAsync(await ReportAsync(me, new { type = "Murder", facts = "Il s'est passé quelque chose.", targetUserId = bobId }), "type");
        Assert.Equal(0, await WithDbAsync(db => db.Reports.CountAsync(Ct)));
        Assert.Empty(Factory.ReportNotifier.Reported);
    }

    [Fact]
    public async Task Every_target_must_exist()
    {
        var (me, _) = await SignedInAsync("me", "Me");
        var (bob, bobId, dog) = await DogOwnerAsync("bob");
        const string facts = "Il s'est passé quelque chose.";

        await AssertProblemAsync(await ReportAsync(me, new { type = "Altercation", facts, targetUserId = Guid.NewGuid() }), HttpStatusCode.NotFound, "user.not_found");
        await AssertProblemAsync(await ReportAsync(me, new { type = "Altercation", facts, targetUserId = bobId, targetDogId = Guid.NewGuid() }), HttpStatusCode.NotFound, "dog.not_found");
        await AssertProblemAsync(await ReportAsync(me, new { type = "Altercation", facts, targetDogId = dog.Id, walkId = Guid.NewGuid() }), HttpStatusCode.NotFound, "walk.not_found");
        Assert.Equal(0, await WithDbAsync(db => db.Reports.CountAsync(Ct)));
    }

    [Fact]
    public async Task You_cannot_report_yourself()
    {
        var (me, session) = await SignedInAsync("me", "Me");

        await AssertProblemAsync(
            await ReportAsync(me, new { type = "HumanBehavior", facts = "Je me signale moi-même.", targetUserId = session.User.Id }),
            HttpStatusCode.BadRequest,
            "report.self");
    }

    [Fact]
    public async Task Reports_are_never_readable_by_their_author_nor_by_the_reported_person()
    {
        var (me, _) = await SignedInAsync("me", "Me");
        var (bob, bobId, _) = await DogOwnerAsync("bob");
        var created = await ReportAsync(me, new { type = "HumanBehavior", facts = "Propos insultants.", targetUserId = bobId });
        var reportId = (await ReadJsonAsync(created)).GetProperty("id").GetGuid();

        foreach (var client in new[] { me, bob })
        {
            Assert.Equal(HttpStatusCode.MethodNotAllowed, (await client.GetAsync("/api/v1/reports", Ct)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/reports/{reportId}", Ct)).StatusCode);
            await AssertProblemAsync(await client.GetAsync("/api/v1/admin/reports", Ct), HttpStatusCode.Forbidden, "admin.forbidden");
            Assert.DoesNotContain("insultants", await client.GetStringAsync("/api/v1/me", Ct), StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task Administrators_get_a_push_with_only_the_category_whatever_their_preferences()
    {
        var (admin, adminSession) = await AdminAsync("admin");
        var (otherAdmin, otherAdminSession) = await AdminAsync("other-admin");
        var (me, _) = await SignedInAsync("me", "Me");
        var (bob, bobId, dog) = await DogOwnerAsync("bob");
        await RegisterDeviceAsync(admin, "admin");
        await RegisterDeviceAsync(otherAdmin, "other-admin");
        await RegisterDeviceAsync(me, "me");
        await RegisterDeviceAsync(bob, "bob");
        // Walk preferences do not apply to this notification.
        await otherAdmin.PutAsJsonAsync("/api/v1/me/notification-preferences", new { registrations = false, walkChanges = false, messages = false, reminders = false }, Ct);
        Factory.PushSender.Clear();

        var response = await ReportAsync(me, new { type = "BiteOrInjury", facts = "Le chien de Bob a mordu Rex au mollet.", targetUserId = bobId, targetDogId = dog.Id });

        var reportId = (await ReadJsonAsync(response)).GetProperty("id").GetGuid();
        var pushes = await SentPushesAsync();
        Assert.Equivalent(new[] { adminSession.User.Id, otherAdminSession.User.Id }, pushes.Select(p => p.UserId));
        Assert.All(pushes, push =>
        {
            Assert.Equal("Nouveau signalement", push.Title);
            Assert.Equal("Un signalement « Morsure ou blessure » attend d'être examiné.", push.Body);
            Assert.Equal("report_created", push.Data["type"]);
            Assert.Equal(reportId.ToString(), push.Data["reportId"]);
            // No deep link: the app has no screen for it and ignores a tap.
            Assert.False(push.Data.ContainsKey("url"));
            Assert.DoesNotContain("mordu", push.Body, StringComparison.Ordinal);
            Assert.DoesNotContain("Bob", push.Title + push.Body, StringComparison.Ordinal);
            Assert.DoesNotContain("Me", push.Title + push.Body, StringComparison.Ordinal);
        });
    }

    [Fact]
    public async Task An_administrator_reporting_is_not_notified_but_the_other_administrators_are()
    {
        var (admin, adminSession) = await AdminAsync("admin");
        var (otherAdmin, otherAdminSession) = await AdminAsync("other-admin");
        var (_, bobId, _) = await DogOwnerAsync("bob");
        await RegisterDeviceAsync(admin, "admin");
        await RegisterDeviceAsync(otherAdmin, "other-admin");
        Factory.PushSender.Clear();

        await ReportAsync(admin, new { type = "HumanBehavior", facts = "Propos insultants au parc.", targetUserId = bobId });

        var push = Assert.Single(await SentPushesAsync());
        Assert.Equal(otherAdminSession.User.Id, push.UserId);
        Assert.NotEqual(adminSession.User.Id, push.UserId);
    }

    [Fact]
    public async Task A_suspended_administrator_is_not_notified_of_reports()
    {
        var (admin, _) = await AdminAsync("admin");
        var (otherAdmin, otherAdminSession) = await AdminAsync("other-admin");
        await RegisterDeviceAsync(otherAdmin, "other-admin");
        // Suspension removes the devices; one registered directly checks the admin rule itself.
        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/v1/admin/users/{otherAdminSession.User.Id}/suspend", null, Ct)).StatusCode);
        await WithDbAsync(async db =>
        {
            db.Devices.Add(new Dogo.Api.Features.Notifications.Device { UserId = otherAdminSession.User.Id, ExpoPushToken = "ExponentPushToken[other-admin]", Platform = Dogo.Api.Features.Notifications.DevicePlatform.Ios });
            await db.SaveChangesAsync(Ct);
        });
        var (me, _) = await SignedInAsync("me", "Me");
        var (_, bobId, _) = await DogOwnerAsync("bob");
        Factory.PushSender.Clear();

        await ReportAsync(me, new { type = "HumanBehavior", facts = "Propos insultants au parc.", targetUserId = bobId });

        Assert.Empty(await SentPushesAsync());
    }

    [Fact]
    public async Task The_notifier_logs_the_id_and_type_but_never_the_facts()
    {
        var logger = new CapturingLogger<AdminReportNotifier>();
        await using var scope = Factory.Services.CreateAsyncScope();
        var notifier = ActivatorUtilities.CreateInstance<AdminReportNotifier>(
            scope.ServiceProvider, Options.Create(new AdminOptions { ReportEmail = "admin@example.org" }), logger);
        var report = new Report
        {
            ReporterId = Guid.NewGuid(),
            TargetUserId = Guid.NewGuid(),
            Type = ReportType.BiteOrInjury,
            Facts = "Secret details about Bob",
        };

        await notifier.ReportCreatedAsync(report, Ct);

        var message = Assert.Single(logger.Messages);
        Assert.Contains(report.Id.ToString(), message, StringComparison.Ordinal);
        Assert.Contains("BiteOrInjury", message, StringComparison.Ordinal);
        Assert.DoesNotContain("Secret", message, StringComparison.Ordinal);
        Assert.DoesNotContain("admin@example.org", message, StringComparison.Ordinal);
        Assert.DoesNotContain(report.TargetUserId.ToString()!, message, StringComparison.Ordinal);
    }

    private sealed class CapturingLogger<T> : ILogger<T>
    {
        public List<string> Messages { get; } = [];

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Messages.Add(formatter(state, exception));
    }
}
