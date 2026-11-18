using System.Collections.Concurrent;
using System.Net;
using System.Text;

namespace Dogo.Api.Tests.Infrastructure;

/// <summary>
/// Stands in for the photo sources of the demo data (DiceBear, Wikipedia, Commons): tests never
/// use the network. By default every request fails like an unreachable network; a test sets
/// <see cref="Respond"/> to serve images or JSON.
/// </summary>
public sealed class FakeDemoPhotoServer
{
    public ConcurrentQueue<HttpRequestMessage> Requests { get; } = new();

    public Func<HttpRequestMessage, HttpResponseMessage> Respond { get; set; } = Unreachable;

    public void Reset()
    {
        Requests.Clear();
        Respond = Unreachable;
    }

    /// <summary>A new primary handler per client: the HTTP client factory disposes handlers it rotates.</summary>
    public HttpMessageHandler CreateHandler() => new Handler(this);

    public static HttpResponseMessage Unreachable(HttpRequestMessage request) =>
        throw new HttpRequestException("The network is not available in tests.");

    public static HttpResponseMessage Image(byte[] bytes, string contentType = "image/png") =>
        new(HttpStatusCode.OK) { Content = new ByteArrayContent(bytes) { Headers = { { "Content-Type", contentType } } } };

    public static HttpResponseMessage Json(string json) =>
        new(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    private sealed class Handler(FakeDemoPhotoServer server) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            server.Requests.Enqueue(request);
            return Task.FromResult(server.Respond(request));
        }
    }
}
