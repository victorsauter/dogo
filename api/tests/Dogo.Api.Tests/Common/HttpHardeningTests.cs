using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Dogo.Api.Tests.Common;

/// <summary>ADR 0031: forwarded headers from trusted proxies only, HSTS, nosniff, JSON body size.</summary>
public sealed class HttpHardeningTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private DogoApiFactory WithAuthLimitOfOne(params (string Key, string? Value)[] settings)
    {
        var values = new Dictionary<string, string?>
        {
            ["RateLimiting:Enabled"] = "true",
            ["RateLimiting:Auth:PermitLimit"] = "1",
        };
        foreach (var (key, value) in settings)
        {
            values[key] = value;
        }

        return new DogoApiFactory(Fixture.ConnectionString, values);
    }

    private static async Task<int> StatusAsync(DogoApiFactory factory, string remote, string? forwardedFor) =>
        (await RateLimitingTests.RefreshFromAsync(factory, remote, forwardedFor)).Response.StatusCode;

    [Fact]
    public async Task Behind_a_trusted_proxy_the_forwarded_client_address_is_used()
    {
        await using var factory = WithAuthLimitOfOne(("Proxy:Enabled", "true"), ("Proxy:KnownProxies:0", "10.0.0.1"));

        Assert.NotEqual(StatusCodes.Status429TooManyRequests, await StatusAsync(factory, "10.0.0.1", "203.0.113.1"));
        Assert.NotEqual(StatusCodes.Status429TooManyRequests, await StatusAsync(factory, "10.0.0.1", "203.0.113.2"));
        Assert.Equal(StatusCodes.Status429TooManyRequests, await StatusAsync(factory, "10.0.0.1", "203.0.113.1"));
    }

    [Fact]
    public async Task A_trusted_network_is_accepted_in_cidr_notation()
    {
        await using var factory = WithAuthLimitOfOne(("Proxy:Enabled", "true"), ("Proxy:KnownNetworks:0", "10.1.0.0/16"));

        Assert.NotEqual(StatusCodes.Status429TooManyRequests, await StatusAsync(factory, "10.1.2.3", "203.0.113.1"));
        Assert.NotEqual(StatusCodes.Status429TooManyRequests, await StatusAsync(factory, "10.1.2.4", "203.0.113.2"));
    }

    [Fact]
    public async Task A_client_cannot_choose_its_address_by_sending_x_forwarded_for()
    {
        await using var factory = WithAuthLimitOfOne(("Proxy:Enabled", "true"), ("Proxy:KnownProxies:0", "10.0.0.1"));

        Assert.NotEqual(StatusCodes.Status429TooManyRequests, await StatusAsync(factory, "198.51.100.7", "203.0.113.10"));
        Assert.Equal(StatusCodes.Status429TooManyRequests, await StatusAsync(factory, "198.51.100.7", "203.0.113.11"));
    }

    [Fact]
    public async Task Forwarded_headers_are_ignored_by_default()
    {
        await using var factory = WithAuthLimitOfOne();

        Assert.NotEqual(StatusCodes.Status429TooManyRequests, await StatusAsync(factory, "10.0.0.1", "203.0.113.1"));
        Assert.Equal(StatusCodes.Status429TooManyRequests, await StatusAsync(factory, "10.0.0.1", "203.0.113.2"));
    }

    [Fact]
    public async Task An_invalid_proxy_address_prevents_startup()
    {
        await using var factory = new DogoApiFactory(
            Fixture.ConnectionString, new Dictionary<string, string?> { ["Proxy:Enabled"] = "true", ["Proxy:KnownProxies:0"] = "not-an-ip" });

        var exception = Assert.ThrowsAny<Exception>(() => factory.CreateClient());

        Assert.Contains("Proxy:KnownProxies", exception.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Https_responses_carry_hsts_outside_development()
    {
        var client = Factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://api.dogo.test") });

        var response = await client.GetAsync("/api/v1/health", Ct);

        var hsts = Assert.Single(response.Headers.GetValues("Strict-Transport-Security"));
        Assert.Contains("max-age=31536000", hsts, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Https_responses_carry_hsts_in_the_demo_environment()
    {
        await using var demo = new DogoApiFactory(Fixture.ConnectionString, environment: "Demo");
        var client = demo.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://api.dogo.test") });

        var response = await client.GetAsync("/api/v1/health", Ct);

        var hsts = Assert.Single(response.Headers.GetValues("Strict-Transport-Security"));
        Assert.Contains("max-age=31536000", hsts, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Hsts_is_not_sent_in_development()
    {
        await using var development = new DogoApiFactory(Fixture.ConnectionString, environment: "Development");
        var client = development.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://api.dogo.test") });

        var response = await client.GetAsync("/api/v1/health", Ct);

        Assert.False(response.Headers.Contains("Strict-Transport-Security"));
    }

    [Fact]
    public async Task Every_response_carries_nosniff()
    {
        var (client, _) = await SignedInAsync();

        foreach (var response in new[]
        {
            await CreateClient().GetAsync("/api/v1/health", Ct),
            await client.GetAsync("/api/v1/does-not-exist", Ct),
            await CreateClient().GetAsync("/api/v1/me", Ct),
            await client.PostAsJsonAsync("/api/v1/dogs", new { name = "" }, Ct),
        })
        {
            Assert.Equal("nosniff", Assert.Single(response.Headers.GetValues("X-Content-Type-Options")));
        }
    }

    [Fact]
    public async Task Json_bodies_over_256_kb_are_rejected()
    {
        var (client, _) = await SignedInAsync();
        var tooLarge = new { name = "Rex", size = "Medium", description = new string('a', 300 * 1024) };
        var large = new { name = "Rex", size = "Medium", description = new string('a', 200 * 1024) };

        // Sent with a Content-Length, like the mobile app (Kestrel also cuts chunked bodies off while reading).
        static StringContent Body(object value) => new(JsonSerializer.Serialize(value), Encoding.UTF8, "application/json");

        await AssertProblemAsync(await client.PostAsync("/api/v1/dogs", Body(tooLarge), Ct), HttpStatusCode.RequestEntityTooLarge, "request.too_large");
        // Under the limit, the body is read and validated as usual.
        await AssertProblemAsync(await client.PostAsync("/api/v1/dogs", Body(large), Ct), HttpStatusCode.BadRequest, "validation.failed");
    }
}
