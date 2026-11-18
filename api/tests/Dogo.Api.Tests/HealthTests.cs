using System.Net;
using Dogo.Api.Tests.Infrastructure;

namespace Dogo.Api.Tests;

public sealed class HealthTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    [Fact]
    public async Task Health_is_anonymous_and_checks_the_database()
    {
        var response = await CreateClient().GetAsync("/api/v1/health", Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("Healthy", (await ReadJsonAsync(response)).GetProperty("status").GetString());
    }
}
