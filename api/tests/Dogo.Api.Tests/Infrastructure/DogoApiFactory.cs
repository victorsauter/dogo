using Dogo.Api.Features.DemoData;
using Dogo.Api.Features.Reports;
using Dogo.Api.Infrastructure.Auth;
using Dogo.Api.Infrastructure.Push;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;

namespace Dogo.Api.Tests.Infrastructure;

/// <summary>
/// In-memory API host for tests: "Testing" environment, fake identity token validator,
/// photos in a temporary directory, push notifications recorded (never sent) and scheduled
/// jobs disabled (tests call them directly with a controlled clock), reports recorded instead of logged,
/// demo data enabled with its photo sources faked. <paramref name="overrides"/> replaces configuration values.
/// </summary>
public sealed class DogoApiFactory(
    string connectionString,
    IReadOnlyDictionary<string, string?>? overrides = null,
    string environment = "Testing") : WebApplicationFactory<Program>
{
    public const string SigningKey = "test-signing-key-0123456789-abcdefghij";
    public const string AdminEmail = "admin@dogo.test";

    public string PhotoPath { get; } = Path.Combine(Path.GetTempPath(), "dogo-tests", Guid.NewGuid().ToString("N"));

    public RecordingPushSender PushSender { get; } = new();

    public RecordingReportNotifier ReportNotifier { get; } = new();

    public FakeDemoPhotoServer DemoPhotos { get; } = new();

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
            ["BackgroundJobs:Enabled"] = "false",
            ["Notifications:Provider"] = "Log",
            // Like the configuration files: demo data on, except in Production where startup refuses it.
            ["DemoData:Enabled"] = environment == Environments.Production ? "false" : "true",
            ["DemoData:Photos:AvatarInterval"] = "00:00:00",
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
            services.RemoveAll<IPushSender>();
            services.AddSingleton<IPushSender>(PushSender);
            services.RemoveAll<IReportNotifier>();
            services.AddSingleton<IReportNotifier>(ReportNotifier);
            services.AddHttpClient(DemoPhotoFetcher.HttpClientName).ConfigurePrimaryHttpMessageHandler(DemoPhotos.CreateHandler);
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
