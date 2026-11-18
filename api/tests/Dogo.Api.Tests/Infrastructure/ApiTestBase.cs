using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Dogo.Api.Features.Auth;
using Dogo.Api.Features.Dogs;
using Dogo.Api.Features.Notifications;
using Dogo.Api.Infrastructure.Push;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;

namespace Dogo.Api.Tests.Infrastructure;

/// <summary>Base class of integration tests: fresh database per test and HTTP helpers.</summary>
public abstract class ApiTestBase(ApiFixture fixture) : IAsyncLifetime
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() },
    };

    protected ApiFixture Fixture => fixture;

    protected DogoApiFactory Factory => fixture.Factory;

    protected static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync()
    {
        // Notifications of the previous test must not leak into this one.
        await WaitForNotificationsAsync();
        await fixture.ResetAsync();
        Factory.PushSender.Clear();
    }

    /// <summary>Push notifications that would have been sent, in order.</summary>
    protected IReadOnlyList<PushMessage> Pushes => Factory.PushSender.Sent;

    /// <summary>Waits until the background dispatcher has processed every queued notification.</summary>
    protected Task WaitForNotificationsAsync() =>
        Factory.Services.GetRequiredService<NotificationQueue>().WaitUntilIdleAsync(TimeSpan.FromSeconds(10), Ct);

    /// <summary>Notifications sent once the queue is drained.</summary>
    protected async Task<IReadOnlyList<PushMessage>> SentPushesAsync()
    {
        await WaitForNotificationsAsync();
        return Pushes;
    }

    /// <summary>Registers a push device for the client's user; the token defaults to one derived from <paramref name="name"/>.</summary>
    protected static async Task<string> RegisterDeviceAsync(HttpClient client, string name, string platform = "Ios")
    {
        var token = $"ExponentPushToken[{name}]";
        var response = await client.PutAsJsonAsync("/api/v1/me/devices", new { expoPushToken = token, platform }, Ct);
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
        return token;
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    protected HttpClient CreateClient(string? accessToken = null)
    {
        var client = Factory.CreateClient();
        if (accessToken is not null)
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        }

        return client;
    }

    protected async Task<SessionResponse> SignInDevAsync(string subject = "alice", string displayName = "Alice")
    {
        var response = await CreateClient().PostAsJsonAsync("/api/v1/auth/dev", new { subject, displayName }, Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SessionResponse>(Json, Ct))!;
    }

    /// <summary>Signs in a dev account and returns a client carrying its access token.</summary>
    protected async Task<(HttpClient Client, SessionResponse Session)> SignedInAsync(string subject = "alice", string displayName = "Alice")
    {
        var session = await SignInDevAsync(subject, displayName);
        return (CreateClient(session.AccessToken), session);
    }

    protected static object ValidDog(string name = "Rex") => new
    {
        name,
        size = "Medium",
        birthDate = "2021-04-12",
        breed = "Border collie",
        sociability = "Easygoing",
        reactivity = "None",
        leashHabit = "OnLeash",
        description = "Loves sticks.",
    };

    protected static async Task<DogResponse> CreateDogAsync(HttpClient client, object? body = null)
    {
        var response = await client.PostAsJsonAsync("/api/v1/dogs", body ?? ValidDog(), Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<DogResponse>(Json, Ct))!;
    }

    protected async Task WithDbAsync(Func<DogoDbContext, Task> action)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        await action(scope.ServiceProvider.GetRequiredService<DogoDbContext>());
    }

    protected async Task<T> WithDbAsync<T>(Func<DogoDbContext, Task<T>> action)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<DogoDbContext>());
    }

    protected static async Task<JsonElement> ReadJsonAsync(HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>(Json, Ct);

    /// <summary>Asserts an RFC 9457 problem with the given status and code, and returns it.</summary>
    protected static async Task<JsonElement> AssertProblemAsync(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        var body = await response.Content.ReadAsStringAsync(Ct);
        Assert.True(status == response.StatusCode, $"Expected {status}, got {response.StatusCode}: {body}");
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = JsonDocument.Parse(body).RootElement;
        Assert.Equal(code, problem.GetProperty("code").GetString());
        Assert.Equal((int)status, problem.GetProperty("status").GetInt32());
        return problem;
    }

    /// <summary>Asserts a 400 <c>validation.failed</c> problem whose errors include each field.</summary>
    protected static async Task AssertValidationProblemAsync(HttpResponseMessage response, params string[] fields)
    {
        var problem = await AssertProblemAsync(response, HttpStatusCode.BadRequest, "validation.failed");
        var errors = problem.GetProperty("errors");
        foreach (var field in fields)
        {
            Assert.True(errors.TryGetProperty(field, out _), $"Expected an error for '{field}' in {errors}");
        }
    }
}
