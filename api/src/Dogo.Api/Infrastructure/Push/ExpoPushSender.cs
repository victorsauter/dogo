using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Infrastructure.Push;

/// <summary>
/// Sends notifications through Expo's push service (<c>POST https://exp.host/--/api/v2/push/send</c>),
/// in batches of at most 100 messages, one device per message so that each returned ticket
/// matches one token. Tickets reporting <c>DeviceNotRegistered</c> are returned in the result
/// so that the caller removes those devices. Push receipts are not checked (see README).
/// </summary>
public sealed partial class ExpoPushSender(
    IHttpClientFactory httpClientFactory,
    IOptions<PushOptions> options,
    ILogger<ExpoPushSender> logger) : IPushSender
{
    public const string HttpClientName = "Expo";

    /// <summary>Expo refuses more than 100 messages in one request (PUSH_TOO_MANY_NOTIFICATIONS).</summary>
    public const int MaxBatchSize = 100;

    private const string DeviceNotRegistered = "DeviceNotRegistered";

    /// <summary>Longest excerpt of a response body written to the log.</summary>
    internal const int MaxLoggedBodyLength = 500;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task<PushResult> SendAsync(IReadOnlyList<PushMessage> messages, CancellationToken cancellationToken)
    {
        var unregistered = new List<string>();
        foreach (var batch in messages.Chunk(MaxBatchSize))
        {
            unregistered.AddRange(await SendBatchAsync(batch, cancellationToken));
        }

        return new PushResult(unregistered);
    }

    private async Task<IEnumerable<string>> SendBatchAsync(PushMessage[] batch, CancellationToken cancellationToken)
    {
        var expo = options.Value.Expo;
        using var request = new HttpRequestMessage(HttpMethod.Post, expo.SendUrl)
        {
            Content = JsonContent.Create(batch.Select(ExpoMessage.From).ToList(), options: Json),
        };
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (!string.IsNullOrWhiteSpace(expo.AccessToken))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", expo.AccessToken);
        }

        using var response = await httpClientFactory.CreateClient(HttpClientName).SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            // 400 (malformed), 401 (access token), 429 and 5xx (temporary): best effort, no retry.
            LogRequestFailed((int)response.StatusCode, batch.Length, ForLog(body));
            return [];
        }

        return ReadUnregisteredTokens(batch, (int)response.StatusCode, body);
    }

    /// <summary>
    /// Masks push tokens (Expo repeats them in error messages; a token lets anyone notify the
    /// device) and shortens the text before it is logged.
    /// </summary>
    internal static string ForLog(string? text)
    {
        if (string.IsNullOrEmpty(text))
        {
            return "";
        }

        var masked = PushTokenRegex().Replace(text, "$1[***]");
        return masked.Length <= MaxLoggedBodyLength ? masked : masked[..MaxLoggedBodyLength] + "…";
    }

    /// <summary>Tickets come back in the order of the messages: ticket i belongs to batch[i].</summary>
    private List<string> ReadUnregisteredTokens(PushMessage[] batch, int status, string body)
    {
        var unregistered = new List<string>();
        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(body);
        }
        catch (JsonException)
        {
            // E.g. an HTML error page of a proxy with a 200 status: the batch is treated as failed.
            LogRequestFailed(status, batch.Length, ForLog(body));
            return unregistered;
        }

        using var _ = document;
        if (document.RootElement.ValueKind != JsonValueKind.Object
            || !document.RootElement.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.Array)
        {
            LogUnexpectedResponse(ForLog(body));
            return unregistered;
        }

        var index = 0;
        foreach (var ticket in data.EnumerateArray())
        {
            if (index >= batch.Length)
            {
                break;
            }

            var message = batch[index++];
            if (ticket.ValueKind == JsonValueKind.Object
                && ticket.TryGetProperty("status", out var ticketStatus) && ticketStatus.ValueKind == JsonValueKind.String
                && ticketStatus.GetString() == "error")
            {
                var error = ticket.TryGetProperty("details", out var details) && details.ValueKind == JsonValueKind.Object
                    && details.TryGetProperty("error", out var code) && code.ValueKind == JsonValueKind.String ? code.GetString() : null;
                var text = ticket.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString() : null;
                LogTicketError(message.UserId, error ?? "unknown", ForLog(text));
                if (error == DeviceNotRegistered)
                {
                    unregistered.Add(message.Token);
                }
            }
        }

        return unregistered;
    }

    [GeneratedRegex(@"(ExponentPushToken|ExpoPushToken)\[[^\]]*\]")]
    private static partial Regex PushTokenRegex();

    [LoggerMessage(Level = LogLevel.Warning, Message = "Expo push request failed with status {Status} for {Count} messages: {Body}")]
    private partial void LogRequestFailed(int status, int count, string body);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Unexpected Expo push response: {Body}")]
    private partial void LogUnexpectedResponse(string body);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Expo rejected a push notification to user {UserId}: {Error} {Message}")]
    private partial void LogTicketError(Guid userId, string error, string message);

    /// <summary>Message format of Expo's push API.</summary>
    private sealed record ExpoMessage(string To, string Title, string Body, IReadOnlyDictionary<string, string> Data, string Sound)
    {
        public static ExpoMessage From(PushMessage message) => new(message.Token, message.Title, message.Body, message.Data, "default");
    }
}
