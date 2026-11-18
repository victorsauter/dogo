using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Reports;
using Dogo.Api.Infrastructure.Auth;
using Dogo.Api.Tests.Infrastructure;
using Dogo.Api.Tests.Walks;
using Microsoft.EntityFrameworkCore;
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
    public async Task The_logging_notifier_logs_the_id_and_type_but_never_the_facts()
    {
        var logger = new CapturingLogger<LoggingReportNotifier>();
        var notifier = new LoggingReportNotifier(Options.Create(new AdminOptions { ReportEmail = "admin@example.org" }), logger);
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
