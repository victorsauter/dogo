using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Dogs;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Tests.Dogs;

public sealed class DogTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    [Fact]
    public async Task Create_dog_returns_201_with_the_dog()
    {
        var (client, session) = await SignedInAsync();

        var response = await client.PostAsJsonAsync("/api/v1/dogs", ValidDog("  Rex  "), Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await ReadJsonAsync(response);
        Assert.Equal($"/api/v1/dogs/{body.GetProperty("id").GetGuid()}", response.Headers.Location?.OriginalString);
        Assert.Equal("Rex", body.GetProperty("name").GetString());
        Assert.Equal(session.User.Id, body.GetProperty("ownerId").GetGuid());
        Assert.Equal("Medium", body.GetProperty("size").GetString());
        Assert.Equal("2021-04-12", body.GetProperty("birthDate").GetString());
        Assert.Equal("Border collie", body.GetProperty("breed").GetString());
        Assert.Equal("Easygoing", body.GetProperty("sociability").GetString());
        Assert.Equal("None", body.GetProperty("reactivity").GetString());
        Assert.Equal("OnLeash", body.GetProperty("leashHabit").GetString());
        Assert.Equal("Loves sticks.", body.GetProperty("description").GetString());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, body.GetProperty("photoUrl").ValueKind);
        Assert.InRange(body.GetProperty("createdAt").GetDateTimeOffset(), DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddSeconds(1));
    }

    [Fact]
    public async Task Create_dog_with_only_required_fields()
    {
        var (client, _) = await SignedInAsync();

        var dog = await CreateDogAsync(client, new { name = "Nala", size = "Small", sociability = "Reserved", reactivity = "Strong", leashHabit = "LongLine" });

        Assert.Null(dog.BirthDate);
        Assert.Null(dog.Breed);
        Assert.Equal("", dog.Description);
    }

    [Fact]
    public async Task Create_dog_accepts_a_birth_date_of_today()
    {
        var (client, _) = await SignedInAsync();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var dog = await CreateDogAsync(client, new { name = "Pup", size = "Small", birthDate = today, sociability = "Easygoing", reactivity = "None", leashHabit = "OnLeash" });

        Assert.Equal(today, dog.BirthDate);
    }

    [Fact]
    public async Task Create_dog_validates_its_fields()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PostAsJsonAsync("/api/v1/dogs", new
        {
            name = new string('n', 51),
            size = "Large",
            birthDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(2),
            breed = new string('b', 81),
            sociability = "Easygoing",
            reactivity = "None",
            leashHabit = "OnLeash",
            description = new string('d', 1001),
        }, Ct);

        await AssertValidationProblemAsync(response, "name", "birthDate", "breed", "description");
        Assert.Equal(0, await WithDbAsync(db => db.Dogs.CountAsync(Ct)));
    }

    [Fact]
    public async Task Create_dog_rejects_a_blank_name()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PostAsJsonAsync("/api/v1/dogs", new { name = "  ", size = "Large", sociability = "Easygoing", reactivity = "None", leashHabit = "OnLeash" }, Ct);

        await AssertValidationProblemAsync(response, "name");
    }

    [Fact]
    public async Task Any_authenticated_user_can_read_a_dog()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var dog = await CreateDogAsync(owner);
        var (other, _) = await SignedInAsync("other", "Other");

        var response = await other.GetAsync($"/api/v1/dogs/{dog.Id}", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(dog, await response.Content.ReadFromJsonAsync<DogResponse>(Json, Ct));
    }

    [Fact]
    public async Task Reading_a_dog_requires_authentication()
    {
        var (owner, _) = await SignedInAsync();
        var dog = await CreateDogAsync(owner);

        await AssertProblemAsync(await CreateClient().GetAsync($"/api/v1/dogs/{dog.Id}", Ct), HttpStatusCode.Unauthorized, "auth.unauthenticated");
    }

    [Fact]
    public async Task Unknown_dog_returns_404()
    {
        var (client, _) = await SignedInAsync();

        await AssertProblemAsync(await client.GetAsync($"/api/v1/dogs/{Guid.NewGuid()}", Ct), HttpStatusCode.NotFound, "dog.not_found");
    }

    [Fact]
    public async Task My_dogs_lists_only_my_dogs_oldest_first()
    {
        var (me, _) = await SignedInAsync("me", "Me");
        var first = await CreateDogAsync(me, ValidDog("First"));
        var second = await CreateDogAsync(me, ValidDog("Second"));
        var (other, _) = await SignedInAsync("other", "Other");
        await CreateDogAsync(other, ValidDog("Not mine"));

        var dogs = (await me.GetFromJsonAsync<List<DogResponse>>("/api/v1/me/dogs", Json, Ct))!;

        Assert.Equal([first.Id, second.Id], dogs.Select(d => d.Id));
    }

    [Fact]
    public async Task My_dogs_honours_the_limit()
    {
        var (me, _) = await SignedInAsync();
        await CreateDogAsync(me, ValidDog("One"));
        await CreateDogAsync(me, ValidDog("Two"));

        var dogs = (await me.GetFromJsonAsync<List<DogResponse>>("/api/v1/me/dogs?limit=1", Json, Ct))!;
        var tooBig = await me.GetAsync("/api/v1/me/dogs?limit=101", Ct);

        Assert.Equal("One", Assert.Single(dogs).Name);
        await AssertValidationProblemAsync(tooBig, "limit");
    }

    [Fact]
    public async Task Owner_updates_only_the_given_fields()
    {
        var (client, _) = await SignedInAsync();
        var dog = await CreateDogAsync(client);

        var response = await client.PatchAsJsonAsync($"/api/v1/dogs/{dog.Id}", new { name = "Rexy", size = "Large", reactivity = "Mild" }, Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = (await response.Content.ReadFromJsonAsync<DogResponse>(Json, Ct))!;
        Assert.Equal(dog with { Name = "Rexy", Size = DogSize.Large, Reactivity = Reactivity.Mild }, updated);
        Assert.Equal(updated, await client.GetFromJsonAsync<DogResponse>($"/api/v1/dogs/{dog.Id}", Json, Ct));
    }

    [Fact]
    public async Task Null_clears_the_optional_birth_date_and_breed_but_not_required_fields()
    {
        var (client, _) = await SignedInAsync();
        var dog = await CreateDogAsync(client);

        var response = await client.PatchAsJsonAsync($"/api/v1/dogs/{dog.Id}", new { birthDate = (string?)null, breed = (string?)null, name = (string?)null, size = (string?)null }, Ct);

        var updated = (await response.Content.ReadFromJsonAsync<DogResponse>(Json, Ct))!;
        Assert.Null(updated.BirthDate);
        Assert.Null(updated.Breed);
        Assert.Equal(dog.Name, updated.Name);
        Assert.Equal(dog.Size, updated.Size);
    }

    [Fact]
    public async Task Update_validates_its_fields()
    {
        var (client, _) = await SignedInAsync();
        var dog = await CreateDogAsync(client);

        var response = await client.PatchAsJsonAsync($"/api/v1/dogs/{dog.Id}", new
        {
            name = "",
            birthDate = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(1),
            description = new string('d', 1001),
        }, Ct);

        await AssertValidationProblemAsync(response, "name", "birthDate", "description");
    }

    [Fact]
    public async Task Only_the_owner_can_update_a_dog()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var dog = await CreateDogAsync(owner);
        var (other, _) = await SignedInAsync("other", "Other");

        var response = await other.PatchAsJsonAsync($"/api/v1/dogs/{dog.Id}", new { name = "Stolen" }, Ct);

        await AssertProblemAsync(response, HttpStatusCode.Forbidden, "dog.forbidden");
        Assert.Equal("Rex", (await owner.GetFromJsonAsync<DogResponse>($"/api/v1/dogs/{dog.Id}", Json, Ct))!.Name);
    }

    [Fact]
    public async Task Updating_an_unknown_dog_returns_404()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PatchAsJsonAsync($"/api/v1/dogs/{Guid.NewGuid()}", new { name = "Ghost" }, Ct);

        await AssertProblemAsync(response, HttpStatusCode.NotFound, "dog.not_found");
    }

    [Fact]
    public async Task Owner_deletes_a_dog()
    {
        var (client, _) = await SignedInAsync();
        var dog = await CreateDogAsync(client);

        var response = await client.DeleteAsync($"/api/v1/dogs/{dog.Id}", Ct);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        await AssertProblemAsync(await client.GetAsync($"/api/v1/dogs/{dog.Id}", Ct), HttpStatusCode.NotFound, "dog.not_found");
    }

    [Fact]
    public async Task Only_the_owner_can_delete_a_dog()
    {
        var (owner, _) = await SignedInAsync("owner", "Owner");
        var dog = await CreateDogAsync(owner);
        var (other, _) = await SignedInAsync("other", "Other");

        var response = await other.DeleteAsync($"/api/v1/dogs/{dog.Id}", Ct);

        await AssertProblemAsync(response, HttpStatusCode.Forbidden, "dog.forbidden");
        Assert.Equal(1, await WithDbAsync(db => db.Dogs.CountAsync(Ct)));
    }

    [Fact]
    public async Task Deleting_an_unknown_dog_returns_404()
    {
        var (client, _) = await SignedInAsync();

        await AssertProblemAsync(await client.DeleteAsync($"/api/v1/dogs/{Guid.NewGuid()}", Ct), HttpStatusCode.NotFound, "dog.not_found");
    }
}
