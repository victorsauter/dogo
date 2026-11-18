using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Dogs;
using Dogo.Api.Tests.Infrastructure;
using Dogo.Api.Tests.Walks;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Common;

/// <summary>Inputs the API used to accept too loosely: padded titles, numeric enums, dates without offset.</summary>
public sealed class StrictInputTests(ApiFixture fixture) : WalkTestBase(fixture)
{
    [Theory]
    [InlineData(" a ")]
    [InlineData("  ab   ")]
    public async Task A_walk_title_needs_three_characters_besides_the_spaces(string title)
    {
        var (client, _) = await SignedInAsync();
        var walk = await CreateWalkAsync(client);

        await AssertValidationProblemAsync(await client.PostAsJsonAsync("/api/v1/walks", ValidWalk(("title", title)), Ct), "title");
        await AssertValidationProblemAsync(await client.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { title }, Ct), "title");
    }

    [Fact]
    public async Task A_padded_walk_title_is_trimmed()
    {
        var (client, _) = await SignedInAsync();

        var walk = await CreateWalkAsync(client, ("title", "  Lac  "));

        Assert.Equal("Lac", walk.Title);
    }

    [Theory]
    [InlineData(7)]
    [InlineData(1)]
    public async Task Enum_values_in_a_body_must_be_names_not_numbers(int size)
    {
        var (client, _) = await SignedInAsync();
        var dog = await CreateDogAsync(client);

        var created = await client.PostAsJsonAsync(
            "/api/v1/dogs", new { name = "Rex", size, sociability = "Easygoing", reactivity = "None", leashHabit = "OnLeash" }, Ct);
        var updated = await client.PatchAsJsonAsync($"/api/v1/dogs/{dog.Id}", new { size }, Ct);
        var numericString = await client.PatchAsJsonAsync($"/api/v1/dogs/{dog.Id}", new { size = size.ToString() }, Ct);

        await AssertValidationProblemAsync(created, "size");
        await AssertValidationProblemAsync(updated, "size");
        await AssertValidationProblemAsync(numericString, "size");
        Assert.Equal(DogSize.Medium, await WithDbAsync(db => db.Dogs.Select(d => d.Size).SingleAsync(Ct)));
    }

    [Theory]
    [InlineData("size=7")]
    [InlineData("size=1")]
    [InlineData("size=Small,Large")]
    public async Task Enum_query_parameters_must_be_names(string query)
    {
        var (client, _) = await SignedInAsync();

        var response = await client.GetAsync($"/api/v1/walks?lat={ParisLatitude}&lng={ParisLongitude}&{query}", Ct);

        await AssertValidationProblemAsync(response, "size");
    }

    [Fact]
    public async Task Every_enum_query_parameter_is_checked()
    {
        var (client, _) = await SignedInAsync();
        var (admin, _) = await AdminAsync();

        await AssertValidationProblemAsync(await client.GetAsync("/api/v1/me/walks?role=0", Ct), "role");
        await AssertValidationProblemAsync(await client.GetAsync("/api/v1/me/walks?role=Organizer&when=5", Ct), "when");
        await AssertValidationProblemAsync(await admin.GetAsync("/api/v1/admin/organizations?status=9", Ct), "status");
        await AssertValidationProblemAsync(await admin.GetAsync("/api/v1/admin/reports?status=1", Ct), "status");
    }

    [Theory]
    [InlineData("size=Small")]
    [InlineData("radiusKm=5")]
    public async Task Enum_names_are_accepted(string query)
    {
        var (client, _) = await SignedInAsync();

        var response = await client.GetAsync($"/api/v1/walks?lat={ParisLatitude}&lng={ParisLongitude}&{query}", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData("2030-05-01T09:00:00")]
    [InlineData("2030-05-01T09:00")]
    [InlineData("2030-05-01")]
    [InlineData("2030-05-01T09:00:00+2")]
    public async Task A_walk_start_without_an_explicit_offset_is_refused(string startsAt)
    {
        var (client, _) = await SignedInAsync();
        var walk = await CreateWalkAsync(client);

        await AssertValidationProblemAsync(await client.PostAsJsonAsync("/api/v1/walks", ValidWalk(("startsAt", startsAt)), Ct), "startsAt");
        await AssertValidationProblemAsync(await client.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { startsAt }, Ct), "startsAt");
    }

    [Theory]
    [InlineData("Z")]
    [InlineData("+00:00")]
    [InlineData("+02:00")]
    [InlineData("-05:30")]
    public async Task A_walk_start_with_an_offset_is_stored_in_utc(string offset)
    {
        var (client, _) = await SignedInAsync();
        var local = Tomorrow.AddDays(1);
        var text = local.ToOffset(offset == "Z" ? TimeSpan.Zero : TimeSpan.Parse(offset.TrimStart('+'))).ToString("yyyy-MM-ddTHH:mm:ss") + offset;

        var walk = await CreateWalkAsync(client, ("startsAt", text));

        Assert.Equal(local, walk.StartsAt);
        Assert.Equal(TimeSpan.Zero, walk.StartsAt.Offset);
    }

    [Fact]
    public async Task A_walk_update_without_a_start_keeps_it()
    {
        var (client, _) = await SignedInAsync();
        var walk = await CreateWalkAsync(client);

        var response = await client.PatchAsJsonAsync($"/api/v1/walks/{walk.Id}", new { startsAt = (string?)null, title = "Autre titre" }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(walk.StartsAt, (await GetWalkAsync(client, walk.Id)).StartsAt);
    }
}
