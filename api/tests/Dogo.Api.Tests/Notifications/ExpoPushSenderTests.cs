using System.Net;
using System.Text;
using System.Text.Json;
using Dogo.Api.Infrastructure.Push;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Tests.Notifications;

/// <summary>The Expo sender against a stub HTTP handler: nothing leaves the machine.</summary>
public sealed class ExpoPushSenderTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed class StubHandler(Func<HttpRequestMessage, string, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public List<(HttpRequestMessage Request, JsonElement Body)> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = await request.Content!.ReadAsStringAsync(cancellationToken);
            Requests.Add((request, JsonDocument.Parse(body).RootElement.Clone()));
            return respond(request, body);
        }
    }

    private sealed class StubFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class ListLogger : ILogger<ExpoPushSender>
    {
        public List<string> Messages { get; } = [];

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Messages.Add(formatter(state, exception));
    }

    private static ExpoPushSender Sender(StubHandler handler, string? accessToken = null, ILogger<ExpoPushSender>? logger = null) => new(
        new StubFactory(handler),
        Options.Create(new PushOptions { Provider = PushProvider.Expo, Expo = new ExpoPushOptions { AccessToken = accessToken } }),
        logger ?? NullLogger<ExpoPushSender>.Instance);

    private static PushMessage Message(int i) => new(
        Guid.NewGuid(), $"ExponentPushToken[{i}]", "Titre", "Corps", new Dictionary<string, string> { ["type"] = "walk_reminder", ["walkId"] = "w" });

    /// <summary>One "ok" ticket per message, in order.</summary>
    private static HttpResponseMessage OkTickets(string body)
    {
        var count = JsonDocument.Parse(body).RootElement.GetArrayLength();
        var tickets = string.Join(",", Enumerable.Range(0, count).Select(i => $$"""{"status":"ok","id":"receipt-{{i}}"}"""));
        return Json($$"""{"data":[{{tickets}}]}""");
    }

    private static HttpResponseMessage Json(string json, HttpStatusCode status = HttpStatusCode.OK) =>
        new(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    [Fact]
    public async Task Messages_are_sent_in_batches_of_100_in_expos_format()
    {
        var handler = new StubHandler((_, body) => OkTickets(body));

        var result = await Sender(handler).SendAsync(Enumerable.Range(0, 150).Select(Message).ToList(), Ct);

        Assert.Empty(result.UnregisteredTokens);
        Assert.Equal([100, 50], handler.Requests.Select(r => r.Body.GetArrayLength()));
        var (request, body) = handler.Requests[0];
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("https://exp.host/--/api/v2/push/send", request.RequestUri!.ToString());
        Assert.Contains(request.Headers.Accept, h => h.MediaType == "application/json");
        Assert.Equal("application/json", request.Content!.Headers.ContentType!.MediaType);
        Assert.Null(request.Headers.Authorization);
        var first = body[0];
        Assert.Equal("ExponentPushToken[0]", first.GetProperty("to").GetString());
        Assert.Equal("Titre", first.GetProperty("title").GetString());
        Assert.Equal("Corps", first.GetProperty("body").GetString());
        Assert.Equal("default", first.GetProperty("sound").GetString());
        Assert.Equal("walk_reminder", first.GetProperty("data").GetProperty("type").GetString());
        Assert.Equal("ExponentPushToken[100]", handler.Requests[1].Body[0].GetProperty("to").GetString());
    }

    [Fact]
    public async Task The_access_token_is_sent_when_configured()
    {
        var handler = new StubHandler((_, body) => OkTickets(body));

        await Sender(handler, "secret-token").SendAsync([Message(1)], Ct);

        var authorization = handler.Requests.Single().Request.Headers.Authorization!;
        Assert.Equal("Bearer", authorization.Scheme);
        Assert.Equal("secret-token", authorization.Parameter);
    }

    [Fact]
    public async Task Tokens_reported_as_not_registered_are_returned()
    {
        var handler = new StubHandler((_, _) => Json(
            """
            {"data":[
              {"status":"ok","id":"a"},
              {"status":"error","message":"\"ExponentPushToken[1]\" is not a registered push notification recipient","details":{"error":"DeviceNotRegistered"}},
              {"status":"error","message":"Message too big","details":{"error":"MessageTooBig"}}
            ]}
            """));

        var result = await Sender(handler).SendAsync([Message(0), Message(1), Message(2)], Ct);

        Assert.Equal(["ExponentPushToken[1]"], result.UnregisteredTokens);
    }

    [Theory]
    [InlineData(HttpStatusCode.BadRequest)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task A_failed_request_is_logged_without_throwing(HttpStatusCode status)
    {
        var handler = new StubHandler((_, _) => Json("""{"errors":[{"code":"INTERNAL","message":"failure"}]}""", status));

        var result = await Sender(handler).SendAsync([Message(0)], Ct);

        Assert.Empty(result.UnregisteredTokens);
    }

    [Fact]
    public async Task An_unexpected_response_is_ignored()
    {
        var handler = new StubHandler((_, _) => Json("""{"something":"else"}"""));

        var result = await Sender(handler).SendAsync([Message(0)], Ct);

        Assert.Empty(result.UnregisteredTokens);
    }

    [Theory]
    [InlineData(HttpStatusCode.OK)]
    [InlineData(HttpStatusCode.BadGateway)]
    public async Task A_response_that_is_not_json_is_logged_as_a_failure_without_throwing(HttpStatusCode status)
    {
        var logger = new ListLogger();
        var handler = new StubHandler((_, _) => new HttpResponseMessage(status)
        {
            Content = new StringContent("<html><body>502 Bad Gateway</body></html>", Encoding.UTF8, "text/html"),
        });

        var result = await Sender(handler, logger: logger).SendAsync([Message(0)], Ct);

        Assert.Empty(result.UnregisteredTokens);
        Assert.Contains(logger.Messages, m => m.Contains("failed", StringComparison.Ordinal) && m.Contains("Bad Gateway", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Push_tokens_are_masked_in_the_logs()
    {
        var logger = new ListLogger();
        var handler = new StubHandler((_, _) => Json(
            """
            {"data":[
              {"status":"error","message":"\"ExponentPushToken[secret-1]\" is not a registered push notification recipient","details":{"error":"DeviceNotRegistered"}}
            ]}
            """));
        var failing = new StubHandler((_, _) => Json("""{"errors":[{"message":"ExpoPushToken[secret-2] is invalid"}]}""", HttpStatusCode.BadRequest));

        var result = await Sender(handler, logger: logger).SendAsync([Message(1)], Ct);
        await Sender(failing, logger: logger).SendAsync([Message(2)], Ct);

        Assert.Equal(["ExponentPushToken[1]"], result.UnregisteredTokens);
        Assert.Equal(2, logger.Messages.Count);
        Assert.DoesNotContain(logger.Messages, m => m.Contains("secret", StringComparison.Ordinal));
        Assert.Contains(logger.Messages, m => m.Contains("ExponentPushToken[***]", StringComparison.Ordinal));
        Assert.Contains(logger.Messages, m => m.Contains("ExpoPushToken[***]", StringComparison.Ordinal));
    }

    [Fact]
    public void Logged_bodies_are_shortened()
    {
        var logged = ExpoPushSender.ForLog(new string('a', 10_000));

        Assert.True(logged.Length <= ExpoPushSender.MaxLoggedBodyLength + 1);
    }
}
