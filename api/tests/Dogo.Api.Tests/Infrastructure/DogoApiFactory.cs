using Dogo.Api.Infrastructure.Auth;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Dogo.Api.Tests.Infrastructure;

/// <summary>
/// In-memory API host for tests: "Testing" environment, fake identity token validator,
/// photos in a temporary directory. <paramref name="overrides"/> replaces configuration values.
/// </summary>
public sealed class DogoApiFactory(
    string connectionString,
    IReadOnlyDictionary<string, string?>? overrides = null,
    string environment = "Testing") : WebApplicationFactory<Program>
{
    public const string SigningKey = "test-signing-key-0123456789-abcdefghij";
    public const string AdminEmail = "admin@dogo.test";

    public string PhotoPath { get; } = Path.Combine(Path.GetTempPath(), "dogo-tests", Guid.NewGuid().ToString("N"));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(environment);

        var settings = new Dictionary<string, string?>
        {
            ["ConnectionStrings:Dogo"] = connectionString,
            ["Auth:AllowDevLogin"] = "true",
            ["Auth:Jwt:SigningKey"] = SigningKey,
            ["Storage:Local:Path"] = PhotoPath,
            ["Admin:Emails:0"] = AdminEmail,
        };
        foreach (var (key, value) in overrides ?? new Dictionary<string, string?>())
        {
            settings[key] = value;
        }

        builder.ConfigureAppConfiguration(config => config.AddInMemoryCollection(settings));
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IIdentityTokenValidator>();
            services.AddSingleton<IIdentityTokenValidator, FakeIdentityTokenValidator>();
        });
    }

    public override async ValueTask DisposeAsync()
    {
        await base.DisposeAsync();
        if (Directory.Exists(PhotoPath))
        {
            Directory.Delete(PhotoPath, recursive: true);
        }
    }
}
