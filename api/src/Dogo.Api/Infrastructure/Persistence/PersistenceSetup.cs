using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Infrastructure.Persistence;

public static class PersistenceSetup
{
    public const string ConnectionStringName = "Dogo";

    public static IServiceCollection AddDogoPersistence(this IServiceCollection services)
    {
        // Configuration is read lazily so test hosts can override the connection string.
        services.AddDbContext<DogoDbContext>((serviceProvider, options) =>
        {
            var connectionString = serviceProvider.GetRequiredService<IConfiguration>().GetConnectionString(ConnectionStringName);
            options
                .UseNpgsql(connectionString, npgsql => npgsql.UseNetTopologySuite())
                .UseSnakeCaseNamingConvention();
        });
        return services;
    }

    /// <summary>Applies pending migrations. Called at startup in Development only.</summary>
    public static async Task MigrateDatabaseAsync(this WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<DogoDbContext>();
        await db.Database.MigrateAsync();
    }
}
