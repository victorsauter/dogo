using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Dogo.Api.Features.Messages;
using Dogo.Api.Features.Users;
using Dogo.Api.Features.Walks;
using Dogo.Api.Tests.Infrastructure;
using Dogo.Api.Tests.Walks;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Messages;

public sealed class MessageTests(ApiFixture fixture) : WalkTestBase(fixture)
{
    private static Task<HttpResponseMessage> PostMessageAsync(HttpClient client, Guid walkId, string text) =>
        client.PostAsJsonAsync($"/api/v1/walks/{walkId}/messages", new { text }, Ct);

    private static async Task<MessageResponse> PostMessageOkAsync(HttpClient client, Guid walkId, string text)
    {
        var response = await PostMessageAsync(client, walkId, text);
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync(Ct));
        return (await response.Content.ReadFromJsonAsync<MessageResponse>(Json, Ct))!;
    }

    private static async Task<MessagePageResponse> ListAsync(HttpClient client, Guid walkId, string query = "")
    {
        var response = await client.GetAsync($"/api/v1/walks/{walkId}/messages{query}", Ct);
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
        return (await response.Content.ReadFromJsonAsync<MessagePageResponse>(Json, Ct))!;
    }

    /// <summary>An organizer, a walk and an accepted participant.</summary>
    private async Task<(HttpClient Organizer, Guid OrganizerId, WalkDetailResponse Walk, HttpClient Participant, Guid ParticipantId)> ThreadAsync(
        params (string Name, object? Value)[] walk)
    {
        var (organizer, session) = await SignedInAsync("organizer", "Organizer");
        var created = await CreateWalkAsync(organizer, walk);
        var (participant, participantId, dog) = await DogOwnerAsync("alice");
        await RegisterOkAsync(participant, created.Id, dog.Id);
        return (organizer, session.User.Id, created, participant, participantId);
    }

    [Fact]
    public async Task The_organizer_and_accepted_participants_write_and_read_the_thread()
    {
        var (organizer, organizerId, walk, participant, participantId) = await ThreadAsync();

        var posted = await PostMessageOkAsync(participant, walk.Id, "  Bonjour à tous !  ");
        await PostMessageOkAsync(organizer, walk.Id, "Rendez-vous devant le portail.");

        Assert.Equal("Bonjour à tous !", posted.Text);
        Assert.True(posted.IsMine);
        Assert.Equal(participantId, posted.Author!.Id);
        Assert.Equal("alice", posted.Author.DisplayName);
        Assert.True(posted.CreatedAt > DateTimeOffset.UtcNow.AddMinutes(-1));

        var page = await ListAsync(organizer, walk.Id);
        Assert.False(page.HasMore);
        Assert.Equal(["Bonjour à tous !", "Rendez-vous devant le portail."], page.Items.Select(m => m.Text));
        Assert.Equal([false, true], page.Items.Select(m => m.IsMine));
        Assert.Equal([participantId, organizerId], page.Items.Select(m => m.Author!.Id));
        Assert.Equal(posted with { IsMine = false }, page.Items[0]);
    }

    [Fact]
    public async Task Others_cannot_read_or_write_the_thread()
    {
        var (organizer, _) = await SignedInAsync("organizer", "Organizer");
        var walk = await CreateWalkAsync(organizer, ("access", "Approval"));
        var (pending, _, pendingDog) = await DogOwnerAsync("pending");
        await RegisterOkAsync(pending, walk.Id, pendingDog.Id);
        var (declined, _, declinedDog) = await DogOwnerAsync("declined");
        var declinedRegistration = Assert.Single(await RegisterOkAsync(declined, walk.Id, declinedDog.Id));
        Assert.Equal(HttpStatusCode.OK, (await DeclineAsync(organizer, walk.Id, declinedRegistration.Id)).StatusCode);
        var (cancelled, _, cancelledDog) = await DogOwnerAsync("cancelled");
        var cancelledRegistration = Assert.Single(await RegisterOkAsync(cancelled, walk.Id, cancelledDog.Id));
        Assert.Equal(HttpStatusCode.OK, (await AcceptAsync(organizer, walk.Id, cancelledRegistration.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await CancelRegistrationAsync(cancelled, walk.Id, cancelledRegistration.Id)).StatusCode);
        var (stranger, _) = await SignedInAsync("stranger", "Stranger");

        foreach (var client in new[] { pending, declined, cancelled, stranger })
        {
            await AssertProblemAsync(await client.GetAsync($"/api/v1/walks/{walk.Id}/messages", Ct), HttpStatusCode.Forbidden, "message.forbidden");
            await AssertProblemAsync(await PostMessageAsync(client, walk.Id, "Coucou"), HttpStatusCode.Forbidden, "message.forbidden");
        }

        Assert.Equal(0, await WithDbAsync(db => db.Messages.CountAsync(Ct)));
    }

    [Fact]
    public async Task A_registration_whose_dog_was_deleted_gives_no_access()
    {
        var (_, _, walk, participant, _) = await ThreadAsync();
        await WithDbAsync(db => db.Registrations.Where(r => r.WalkId == walk.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.DogId, (Guid?)null), Ct));

        await AssertProblemAsync(await participant.GetAsync($"/api/v1/walks/{walk.Id}/messages", Ct), HttpStatusCode.Forbidden, "message.forbidden");
    }

    [Fact]
    public async Task An_unknown_walk_returns_404()
    {
        var (client, _) = await SignedInAsync();

        await AssertProblemAsync(await client.GetAsync($"/api/v1/walks/{Guid.NewGuid()}/messages", Ct), HttpStatusCode.NotFound, "walk.not_found");
        await AssertProblemAsync(await PostMessageAsync(client, Guid.NewGuid(), "Coucou"), HttpStatusCode.NotFound, "walk.not_found");
    }

    [Fact]
    public async Task A_cancelled_walks_thread_is_readable_but_closed()
    {
        var (organizer, _, walk, participant, _) = await ThreadAsync();
        await PostMessageOkAsync(participant, walk.Id, "Avant l'annulation");
        Assert.Equal(HttpStatusCode.OK, (await organizer.PostAsync($"/api/v1/walks/{walk.Id}/cancel", null, Ct)).StatusCode);

        await AssertProblemAsync(await PostMessageAsync(participant, walk.Id, "Dommage"), HttpStatusCode.Conflict, "walk.not_open");
        await AssertProblemAsync(await PostMessageAsync(organizer, walk.Id, "Désolé"), HttpStatusCode.Conflict, "walk.not_open");
        Assert.Single((await ListAsync(participant, walk.Id)).Items);
    }

    [Fact]
    public async Task A_past_walks_thread_stays_open()
    {
        var (_, _, walk, participant, _) = await ThreadAsync();
        await MoveWalkStartAsync(walk.Id, DateTimeOffset.UtcNow.AddDays(-1));

        await PostMessageOkAsync(participant, walk.Id, "Merci pour la balade !");
    }

    [Theory]
    [InlineData("")]
    [InlineData("    ")]
    [InlineData(null)]
    public async Task A_blank_message_is_refused(string? text)
    {
        var (organizer, _, walk, _, _) = await ThreadAsync();

        await AssertValidationProblemAsync(await PostMessageAsync(organizer, walk.Id, text!), "text");
    }

    [Fact]
    public async Task A_message_holds_at_most_1000_characters_once_trimmed()
    {
        var (organizer, _, walk, _, _) = await ThreadAsync();

        await AssertValidationProblemAsync(await PostMessageAsync(organizer, walk.Id, new string('a', 1001)), "text");
        var longest = await PostMessageOkAsync(organizer, walk.Id, $"  {new string('a', 1000)}\n ");
        Assert.Equal(1000, longest.Text.Length);
    }

    [Fact]
    public async Task The_thread_is_paged_from_the_most_recent_messages()
    {
        var (organizer, _, walk, participant, _) = await ThreadAsync();
        var ids = new List<Guid>();
        for (var i = 1; i <= 5; i++)
        {
            ids.Add((await PostMessageOkAsync(i % 2 == 0 ? organizer : participant, walk.Id, $"Message {i}")).Id);
        }

        var latest = await ListAsync(participant, walk.Id, "?limit=2");
        Assert.Equal(["Message 4", "Message 5"], latest.Items.Select(m => m.Text));
        Assert.True(latest.HasMore);

        var older = await ListAsync(participant, walk.Id, $"?limit=2&before={latest.Items[0].Id}");
        Assert.Equal(["Message 2", "Message 3"], older.Items.Select(m => m.Text));
        Assert.True(older.HasMore);

        var oldest = await ListAsync(participant, walk.Id, $"?limit=2&before={older.Items[0].Id}");
        Assert.Equal(["Message 1"], oldest.Items.Select(m => m.Text));
        Assert.False(oldest.HasMore);

        var exact = await ListAsync(participant, walk.Id, $"?limit=4&before={ids[4]}");
        Assert.Equal(ids[..4], exact.Items.Select(m => m.Id));
        Assert.False(exact.HasMore);

        var none = await ListAsync(participant, walk.Id, $"?before={ids[0]}");
        Assert.Empty(none.Items);
        Assert.False(none.HasMore);
    }

    [Fact]
    public async Task Messages_with_the_same_timestamp_are_paged_by_id()
    {
        var (organizer, organizerId, walk, _, _) = await ThreadAsync();
        var createdAt = DateTimeOffset.UtcNow.AddMinutes(-5);
        createdAt = createdAt.AddTicks(-(createdAt.Ticks % TimeSpan.TicksPerMicrosecond));
        var messages = Enumerable.Range(1, 4)
            .Select(i => new Message { WalkId = walk.Id, AuthorId = organizerId, Text = $"Message {i}" })
            .OrderBy(m => m.Id.ToString())
            .ToList();
        await WithDbAsync(async db =>
        {
            db.Messages.AddRange(messages);
            await db.SaveChangesAsync(Ct);
            await db.Messages.ExecuteUpdateAsync(s => s.SetProperty(m => m.CreatedAt, createdAt), Ct);
        });

        var first = await ListAsync(organizer, walk.Id, "?limit=2");
        var second = await ListAsync(organizer, walk.Id, $"?limit=2&before={first.Items[0].Id}");

        // Same order as PostgreSQL's uuid ordering, with neither overlap nor gap.
        var all = second.Items.Concat(first.Items).Select(m => m.Id).ToList();
        Assert.Equal(4, all.Distinct().Count());
        Assert.Equal(all.OrderBy(id => id.ToString()).ToList(), all);
        Assert.False(second.HasMore);
    }

    [Fact]
    public async Task Paging_parameters_are_validated()
    {
        var (organizer, _, walk, _, _) = await ThreadAsync();
        var (otherOrganizer, _) = await SignedInAsync("other", "Other");
        var otherWalk = await CreateWalkAsync(otherOrganizer);
        var foreign = await PostMessageOkAsync(otherOrganizer, otherWalk.Id, "Ailleurs");

        await AssertValidationProblemAsync(await organizer.GetAsync($"/api/v1/walks/{walk.Id}/messages?limit=0", Ct), "limit");
        await AssertValidationProblemAsync(await organizer.GetAsync($"/api/v1/walks/{walk.Id}/messages?limit=101", Ct), "limit");
        await AssertValidationProblemAsync(await organizer.GetAsync($"/api/v1/walks/{walk.Id}/messages?before={foreign.Id}", Ct), "before");
        await AssertValidationProblemAsync(await organizer.GetAsync($"/api/v1/walks/{walk.Id}/messages?before={Guid.NewGuid()}", Ct), "before");
    }

    [Fact]
    public async Task A_message_whose_author_no_longer_exists_has_no_author()
    {
        var (organizer, _, walk, participant, participantId) = await ThreadAsync();
        await PostMessageOkAsync(participant, walk.Id, "Je pars bientôt");

        await WithDbAsync(db => db.Users.Where(u => u.Id == participantId).ExecuteDeleteAsync(Ct));

        var message = Assert.Single((await ListAsync(organizer, walk.Id)).Items);
        Assert.Null(message.Author);
        Assert.False(message.IsMine);
        Assert.Equal("Je pars bientôt", message.Text);

        var json = await ReadJsonAsync(await organizer.GetAsync($"/api/v1/walks/{walk.Id}/messages", Ct));
        Assert.Equal(JsonValueKind.Null, json.GetProperty("items")[0].GetProperty("author").ValueKind);
    }

    [Fact]
    public async Task A_suspended_account_cannot_post()
    {
        var (_, _, walk, participant, participantId) = await ThreadAsync();
        await WithDbAsync(db => db.Users.Where(u => u.Id == participantId)
            .ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, UserStatus.Suspended), Ct));

        await AssertProblemAsync(await PostMessageAsync(participant, walk.Id, "Coucou"), HttpStatusCode.Forbidden, "account.suspended");
        Assert.Empty((await ListAsync(participant, walk.Id)).Items);
    }

    [Fact]
    public async Task The_thread_requires_authentication()
    {
        var response = await CreateClient().GetAsync($"/api/v1/walks/{Guid.NewGuid()}/messages", Ct);

        await AssertProblemAsync(response, HttpStatusCode.Unauthorized, "auth.unauthenticated");
    }
}
