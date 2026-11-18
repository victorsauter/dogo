using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using DotNet.Testcontainers.Images;
using Testcontainers.PostgreSql;

namespace Dogo.Api.Tests.Infrastructure;

/// <summary>
/// Shared by the whole test run: one PostGIS container (Testcontainers), migrated once,
/// and one API host. <see cref="ResetAsync"/> empties every table before each test.
/// </summary>
public sealed class ApiFixture : IAsyncLifetime
{
    // Same image as docker-compose.yml. Only published for amd64: emulated on Apple silicon.
    public const string PostgisImage = "postgis/postgis:18-3.6";

    private readonly PostgreSqlContainer _container;

    public ApiFixture()
    {
        // Tests never use the network apart from the local Docker socket. A system HTTP proxy
        // makes the Docker client fail on macOS (MacProxy cannot handle unix:// URIs).
        HttpClient.DefaultProxy = new WebProxy();
        _container = new PostgreSqlBuilder(new DockerImage(PostgisImage, new Platform("linux/amd64"))).Build();
    }

    public DogoApiFactory Factory { get; private set; } = null!;

    public string ConnectionString => _container.GetConnectionString();

    public async ValueTask InitializeAsync()
    {
        await _container.StartAsync();
        Factory = new DogoApiFactory(ConnectionString);

        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DogoDbContext>();
        await db.Database.MigrateAsync();
    }

    public async Task ResetAsync()
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DogoDbContext>();
        var tables = await db.Database.SqlQueryRaw<string>(
            """
            SELECT format('%I.%I', schemaname, tablename) AS "Value"
            FROM pg_tables
            WHERE schemaname = 'public' AND tablename NOT IN ('__EFMigrationsHistory', 'spatial_ref_sys')
            """).ToListAsync();
        if (tables.Count > 0)
        {
#pragma warning disable EF1002 // Table names come from the catalog, not from user input.
            await db.Database.ExecuteSqlRawAsync($"TRUNCATE TABLE {string.Join(", ", tables)} CASCADE");
#pragma warning restore EF1002
        }

        if (Directory.Exists(Factory.PhotoPath))
        {
            Directory.Delete(Factory.PhotoPath, recursive: true);
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (Factory is not null)
        {
            await Factory.DisposeAsync();
        }

        await _container.DisposeAsync();
    }
}
