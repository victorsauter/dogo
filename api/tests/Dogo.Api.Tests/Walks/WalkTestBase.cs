using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Dogs;
using Dogo.Api.Features.Walks;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Time.Testing;

namespace Dogo.Api.Tests.Walks;

/// <summary>Helpers shared by the walk and registration tests.</summary>
public abstract class WalkTestBase(ApiFixture fixture) : ApiTestBase(fixture)
{
    /// <summary>Notre-Dame de Paris.</summary>
    protected const double ParisLatitude = 48.8530;
    protected const double ParisLongitude = 2.3499;

    /// <summary>Tomorrow at a whole second, so that values compare exactly after a round trip.</summary>
    protected static DateTimeOffset Tomorrow { get; } = TruncateToSecond(DateTimeOffset.UtcNow.AddDays(1));

    protected static DateTimeOffset TruncateToSecond(DateTimeOffset value) =>
        new(value.Ticks - (value.Ticks % TimeSpan.TicksPerSecond), TimeSpan.Zero);

    /// <summary>A valid create-walk body; <paramref name="overrides"/> replaces or adds properties.</summary>
    protected static Dictionary<string, object?> ValidWalk(params (string Name, object? Value)[] overrides)
    {
        var body = new Dictionary<string, object?>
        {
            ["title"] = "Balade au parc",
            ["description"] = "Tour du lac.",
            ["startsAt"] = Tomorrow,
            ["durationMinutes"] = 90,
            ["location"] = new { latitude = ParisLatitude, longitude = ParisLongitude },
            ["locationLabel"] = "Parvis de Notre-Dame",
            ["maxDogs"] = 5,
            ["allowedSizes"] = new[] { "Small", "Medium", "Large" },
            ["leashRule"] = "LeashRequired",
            ["rules"] = "Ramasser les crottes.",
            ["access"] = "Open",
        };
        foreach (var (name, value) in overrides)
        {
            body[name] = value;
        }

        return body;
    }

    protected static async Task<WalkDetailResponse> CreateWalkAsync(HttpClient client, params (string Name, object? Value)[] overrides)
    {
        var response = await client.PostAsJsonAsync("/api/v1/walks", ValidWalk(overrides), Ct);
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync(Ct));
        return (await response.Content.ReadFromJsonAsync<WalkDetailResponse>(Json, Ct))!;
    }

    protected static async Task<WalkDetailResponse> GetWalkAsync(HttpClient client, Guid walkId) =>
        (await client.GetFromJsonAsync<WalkDetailResponse>($"/api/v1/walks/{walkId}", Json, Ct))!;

    protected static Task<HttpResponseMessage> RegisterAsync(HttpClient client, Guid walkId, params Guid[] dogIds) =>
        client.PostAsJsonAsync($"/api/v1/walks/{walkId}/registrations", new { dogIds }, Ct);

    /// <summary>Registers dogs and asserts success; returns the created registrations.</summary>
    protected static async Task<List<RegistrationResponse>> RegisterOkAsync(HttpClient client, Guid walkId, params Guid[] dogIds)
    {
        var response = await RegisterAsync(client, walkId, dogIds);
        Assert.True(response.StatusCode == HttpStatusCode.Created, await response.Content.ReadAsStringAsync(Ct));
        return (await response.Content.ReadFromJsonAsync<List<RegistrationResponse>>(Json, Ct))!;
    }

    protected static Task<HttpResponseMessage> AcceptAsync(HttpClient client, Guid walkId, Guid registrationId) =>
        client.PostAsync($"/api/v1/walks/{walkId}/registrations/{registrationId}/accept", null, Ct);

    protected static Task<HttpResponseMessage> DeclineAsync(HttpClient client, Guid walkId, Guid registrationId) =>
        client.PostAsync($"/api/v1/walks/{walkId}/registrations/{registrationId}/decline", null, Ct);

    protected static Task<HttpResponseMessage> CancelRegistrationAsync(HttpClient client, Guid walkId, Guid registrationId) =>
        client.DeleteAsync($"/api/v1/walks/{walkId}/registrations/{registrationId}", Ct);

    protected static async Task<DogResponse> CreateDogOfSizeAsync(HttpClient client, string name, string size) =>
        await CreateDogAsync(client, new { name, size, sociability = "Easygoing", reactivity = "None", leashHabit = "OnLeash" });

    /// <summary>
    /// Moves a walk's start in the database, e.g. into the past to simulate a walk that has
    /// started (the API refuses to create one in the past).
    /// </summary>
    protected Task MoveWalkStartAsync(Guid walkId, DateTimeOffset startsAt) =>
        WithDbAsync(db => db.Walks.Where(w => w.Id == walkId).ExecuteUpdateAsync(s => s.SetProperty(w => w.StartsAt, startsAt), Ct));

    /// <summary>Runs the reminder job once as if the time were <paramref name="now"/>.</summary>
    protected Task<int> RunReminderJobAsync(DateTimeOffset now) =>
        RunJobAsync<WalkReminderJob>(now, (job, ct) => job.RunAsync(ct));

    /// <summary>Runs the weekly series job once as if the time were <paramref name="now"/>.</summary>
    protected Task<int> RunSeriesJobAsync(DateTimeOffset now) =>
        RunJobAsync<WalkSeriesJob>(now, (job, ct) => job.RunAsync(ct));

    private async Task<int> RunJobAsync<TJob>(DateTimeOffset now, Func<TJob, CancellationToken, Task<int>> run)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var job = ActivatorUtilities.CreateInstance<TJob>(scope.ServiceProvider, new FakeTimeProvider(now));
        return await run(job, Ct);
    }

    /// <summary>A user who signed in with a dev account and owns one medium dog.</summary>
    protected async Task<(HttpClient Client, Guid UserId, DogResponse Dog)> DogOwnerAsync(string subject, string size = "Medium")
    {
        var (client, session) = await SignedInAsync(subject, subject);
        var dog = await CreateDogOfSizeAsync(client, $"Dog of {subject}", size);
        return (client, session.User.Id, dog);
    }
}
