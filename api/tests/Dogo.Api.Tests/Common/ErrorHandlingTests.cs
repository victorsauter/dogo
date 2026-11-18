using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Dogo.Api.Tests.Common;

public sealed class ErrorHandlingTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    [Fact]
    public async Task Unknown_route_returns_a_not_found_problem()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.GetAsync("/api/v1/does-not-exist", Ct);

        await AssertProblemAsync(response, HttpStatusCode.NotFound, "not_found");
    }

    [Fact]
    public async Task Unknown_route_requires_authentication_like_everything_else()
    {
        var response = await CreateClient().GetAsync("/api/v1/does-not-exist", Ct);

        await AssertProblemAsync(response, HttpStatusCode.Unauthorized, "auth.unauthenticated");
    }

    [Fact]
    public async Task Missing_access_token_returns_an_unauthenticated_problem()
    {
        var response = await CreateClient().GetAsync("/api/v1/me", Ct);

        await AssertProblemAsync(response, HttpStatusCode.Unauthorized, "auth.unauthenticated");
    }

    [Fact]
    public async Task Garbage_access_token_is_rejected()
    {
        var response = await CreateClient("not-a-jwt").GetAsync("/api/v1/me", Ct);

        await AssertProblemAsync(response, HttpStatusCode.Unauthorized, "auth.unauthenticated");
    }

    [Fact]
    public async Task Expired_access_token_is_rejected()
    {
        var session = await SignInDevAsync();
        var token = CreateToken(session.User.Id, DogoApiFactory.SigningKey, DateTime.UtcNow.AddMinutes(-2));

        var response = await CreateClient(token).GetAsync("/api/v1/me", Ct);

        await AssertProblemAsync(response, HttpStatusCode.Unauthorized, "auth.unauthenticated");
    }

    [Fact]
    public async Task Access_token_signed_with_another_key_is_rejected()
    {
        var session = await SignInDevAsync();
        var token = CreateToken(session.User.Id, "another-signing-key-0123456789-abcdefghij", DateTime.UtcNow.AddMinutes(10));

        var response = await CreateClient(token).GetAsync("/api/v1/me", Ct);

        await AssertProblemAsync(response, HttpStatusCode.Unauthorized, "auth.unauthenticated");
    }

    [Fact]
    public async Task Malformed_json_returns_a_validation_problem()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PostAsync("/api/v1/dogs", new StringContent("{ not json", Encoding.UTF8, "application/json"), Ct);

        await AssertProblemAsync(response, HttpStatusCode.BadRequest, "validation.failed");
    }

    [Fact]
    public async Task Unknown_enum_value_is_reported_on_its_field()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PostAsJsonAsync("/api/v1/dogs", new
        {
            name = "Rex",
            size = "Huge",
            sociability = "Easygoing",
            reactivity = "None",
            leashHabit = "OnLeash",
        }, Ct);

        await AssertValidationProblemAsync(response, "size");
    }

    [Fact]
    public async Task Missing_required_properties_are_reported_on_their_fields()
    {
        var (client, _) = await SignedInAsync();

        var response = await client.PostAsJsonAsync("/api/v1/dogs", new { name = "Rex" }, Ct);

        await AssertValidationProblemAsync(response, "size", "sociability", "reactivity", "leashHabit");
    }

    [Fact]
    public async Task Unhandled_exception_returns_a_500_problem_without_details()
    {
        var response = await CreateClient().PostAsJsonAsync("/api/v1/auth/google", new { idToken = "throw" }, Ct);

        var problem = await AssertProblemAsync(response, HttpStatusCode.InternalServerError, "server.error");
        Assert.DoesNotContain("Sensitive", problem.GetRawText(), StringComparison.Ordinal);
        Assert.False(problem.TryGetProperty("exception", out _));
    }

    private static string CreateToken(Guid userId, string key, DateTime expires) =>
        new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = "dogo-api",
            Audience = "dogo-app",
            Subject = new ClaimsIdentity([new Claim(JwtRegisteredClaimNames.Sub, userId.ToString())]),
            NotBefore = expires.AddMinutes(-15),
            IssuedAt = expires.AddMinutes(-15),
            Expires = expires,
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)), SecurityAlgorithms.HmacSha256),
        });
}
