using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Users;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Common;

/// <summary>Spec §1: every write by a suspended account returns 403 account.suspended.</summary>
public sealed class SuspendedAccountTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    [Fact]
    public async Task Suspended_user_cannot_update_their_profile()
    {
        var (client, session) = await SignedInAsync();
        await SuspendAsync(session.User.Id);

        var response = await client.PatchAsJsonAsync("/api/v1/me", new { bio = "Hello" }, Ct);

        await AssertProblemAsync(response, HttpStatusCode.Forbidden, "account.suspended");
    }

    [Fact]
    public async Task Suspended_user_cannot_create_a_dog()
    {
        var (client, session) = await SignedInAsync();
        await SuspendAsync(session.User.Id);

        var response = await client.PostAsJsonAsync("/api/v1/dogs", ValidDog(), Ct);

        await AssertProblemAsync(response, HttpStatusCode.Forbidden, "account.suspended");
        Assert.Equal(0, await WithDbAsync(db => db.Dogs.CountAsync(Ct)));
    }

    [Fact]
    public async Task Suspended_user_cannot_delete_a_dog()
    {
        var (client, session) = await SignedInAsync();
        var dog = await CreateDogAsync(client);
        await SuspendAsync(session.User.Id);

        var response = await client.DeleteAsync($"/api/v1/dogs/{dog.Id}", Ct);

        await AssertProblemAsync(response, HttpStatusCode.Forbidden, "account.suspended");
    }

    [Fact]
    public async Task Suspended_user_can_still_read()
    {
        var (client, session) = await SignedInAsync();
        await SuspendAsync(session.User.Id);

        var response = await client.GetAsync("/api/v1/me", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Suspended", (await ReadJsonAsync(response)).GetProperty("status").GetString());
    }

    private Task SuspendAsync(Guid userId) => WithDbAsync(db =>
        db.Users.Where(u => u.Id == userId).ExecuteUpdateAsync(s => s.SetProperty(u => u.Status, UserStatus.Suspended), Ct));
}
