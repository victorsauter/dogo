using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.Auth;
using Dogo.Api.Tests.Infrastructure;
using Npgsql;

namespace Dogo.Api.Tests.Common;

/// <summary>
/// The hosted demo (ADR 0043) runs in the <c>Demo</c> environment: the dev sign-in and the demo data exist, the
/// migrations are applied at startup (the free host has no step before a deployment). The refusals (development key,
/// dev tools elsewhere) are in <see cref="StartupConfigurationTests"/>, HSTS in <see cref="HttpHardeningTests"/>.
/// </summary>
public sealed class DemoEnvironmentTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    [Fact]
    public async Task The_dev_sign_in_and_the_demo_data_routes_exist_in_the_demo_environment()
    {
        await using var host = new DogoApiFactory(Fixture.ConnectionString, environment: "Demo");
        var client = host.CreateClient();

        var signIn = await client.PostAsJsonAsync("/api/v1/auth/dev", new { subject = "alice", displayName = "Alice" }, Ct);
        var demoData = await client.GetAsync("/api/v1/dev/demo-data", Ct);

        Assert.Equal(HttpStatusCode.OK, signIn.StatusCode);
        Assert.NotNull(await signIn.Content.ReadFromJsonAsync<SessionResponse>(Json, Ct));
        Assert.Equal(HttpStatusCode.OK, demoData.StatusCode);
    }

    [Fact]
    public async Task The_dev_routes_stay_off_in_the_demo_environment_when_their_options_are_off()
    {
        await using var host = new DogoApiFactory(
            Fixture.ConnectionString,
            new Dictionary<string, string?> { ["Auth:AllowDevLogin"] = "false", ["DemoData:Enabled"] = "false" },
            environment: "Demo");
        var client = host.CreateClient();

        var signIn = await client.PostAsJsonAsync("/api/v1/auth/dev", new { subject = "alice", displayName = "Alice" }, Ct);
        var demoData = await client.GetAsync("/api/v1/dev/demo-data", Ct);

        // 401: unknown routes sit behind the fallback authorization policy, like in Production.
        Assert.Equal(HttpStatusCode.Unauthorized, signIn.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, demoData.StatusCode);
    }

    [Fact]
    public async Task A_dev_account_can_be_an_administrator_in_the_demo_environment()
    {
        await using var host = new DogoApiFactory(Fixture.ConnectionString, environment: "Demo");

        var response = await host.CreateClient().PostAsJsonAsync(
            "/api/v1/auth/dev", new { subject = "admin", displayName = "Admin", email = DogoApiFactory.AdminEmail }, Ct);

        var session = (await response.Content.ReadFromJsonAsync<SessionResponse>(Json, Ct))!;
        Assert.True(session.User.IsAdmin);
    }

    [Fact]
    public async Task The_migrations_are_applied_at_startup_in_the_demo_environment()
    {
        var connectionString = await CreateEmptyDatabaseAsync();
        try
        {
            await using var host = new DogoApiFactory(connectionString, environment: "Demo");

            var health = await host.CreateClient().GetAsync("/api/v1/health", Ct);

            Assert.Equal(HttpStatusCode.OK, health.StatusCode);
            Assert.True(await ScalarAsync<long>(connectionString, "SELECT count(*) FROM \"__EFMigrationsHistory\"") > 0);
            Assert.True(await ScalarAsync<long>(connectionString, "SELECT count(*) FROM users") == 0);
        }
        finally
        {
            await DropDatabaseAsync(connectionString);
        }
    }

    [Fact]
    public async Task The_migrations_are_not_applied_at_startup_in_production()
    {
        var connectionString = await CreateEmptyDatabaseAsync();
        try
        {
            await using var host = new DogoApiFactory(
                connectionString,
                new Dictionary<string, string?>
                {
                    ["Notifications:Provider"] = "Expo",
                    ["Auth:Google:Audiences:0"] = "client-id.apps.googleusercontent.com",
                },
                environment: "Production");

            host.CreateClient();

            Assert.Null(await ScalarAsync<string>(connectionString, "SELECT to_regclass('public.\"__EFMigrationsHistory\"')::text"));
        }
        finally
        {
            await DropDatabaseAsync(connectionString);
        }
    }

    private async Task<string> CreateEmptyDatabaseAsync()
    {
        var name = $"demo_{Guid.NewGuid():N}";
        await using (var connection = new NpgsqlConnection(Fixture.ConnectionString))
        {
            await connection.OpenAsync(Ct);
            await using var command = new NpgsqlCommand($"CREATE DATABASE {name}", connection);
            await command.ExecuteNonQueryAsync(Ct);
        }

        return new NpgsqlConnectionStringBuilder(Fixture.ConnectionString) { Database = name, Pooling = false }.ConnectionString;
    }

    private async Task DropDatabaseAsync(string connectionString)
    {
        var name = new NpgsqlConnectionStringBuilder(connectionString).Database;
        NpgsqlConnection.ClearAllPools();
        await using var connection = new NpgsqlConnection(Fixture.ConnectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand($"DROP DATABASE IF EXISTS {name} WITH (FORCE)", connection);
        await command.ExecuteNonQueryAsync(Ct);
    }

    private async Task<T?> ScalarAsync<T>(string connectionString, string sql)
    {
        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(Ct);
        await using var command = new NpgsqlCommand(sql, connection);
        var value = await command.ExecuteScalarAsync(Ct);
        return value is null or DBNull ? default : (T)value;
    }
}
