using Dogo.Api.Infrastructure.Auth;
using Dogo.Api.Infrastructure.Hosting;
using Dogo.Api.Infrastructure.Push;
using Dogo.Api.Infrastructure.Storage;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace Dogo.Api.Tests.Common;

/// <summary>
/// The application refuses to start with an unsafe or incomplete configuration. Development tools
/// are allowed in Development and Testing only (allow list, ADR 0031).
/// </summary>
public sealed class StartupConfigurationTests(ApiFixture fixture)
{
    /// <summary>What a Production deployment needs to start, on top of the factory's values.</summary>
    private static Dictionary<string, string?> ProductionSettings(params (string Key, string? Value)[] overrides)
    {
        var settings = new Dictionary<string, string?>
        {
            ["Notifications:Provider"] = "Expo",
            ["Auth:Google:Audiences:0"] = "client-id.apps.googleusercontent.com",
        };
        foreach (var (key, value) in overrides)
        {
            settings[key] = value;
        }

        return settings;
    }

    private static void AssertStartupFails(DogoApiFactory factory, string expected)
    {
        var exception = Assert.ThrowsAny<Exception>(() => factory.CreateClient());
        Assert.Contains(expected, exception.ToString(), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    [InlineData("Preview")]
    public async Task Dev_login_outside_development_and_testing_prevents_startup(string environment)
    {
        await using var factory = new DogoApiFactory(
            fixture.ConnectionString, ProductionSettings(("Auth:AllowDevLogin", "true")), environment);

        AssertStartupFails(factory, "Auth:AllowDevLogin must not be enabled");
    }

    [Theory]
    [InlineData("00:10:00")]
    [InlineData("-00:00:01")]
    public async Task A_refresh_token_grace_period_out_of_range_prevents_startup(string gracePeriod)
    {
        await using var factory = new DogoApiFactory(
            fixture.ConnectionString, new Dictionary<string, string?> { ["Auth:Jwt:RefreshTokenGracePeriod"] = gracePeriod });

        AssertStartupFails(factory, "Auth:Jwt:RefreshTokenGracePeriod must be between");
    }

    [Fact]
    public async Task The_local_photo_storage_is_the_default()
    {
        await using var factory = new DogoApiFactory(fixture.ConnectionString);

        Assert.IsType<LocalPhotoStorage>(factory.Services.GetRequiredService<IPhotoStorage>());
    }

    [Theory]
    [InlineData("ServiceUrl")]
    [InlineData("Bucket")]
    [InlineData("Region")]
    [InlineData("AccessKeyId")]
    [InlineData("SecretAccessKey")]
    public async Task The_s3_photo_storage_without_one_of_its_settings_prevents_startup(string missing)
    {
        await using var factory = new DogoApiFactory(fixture.ConnectionString, S3Settings((missing, null)));

        AssertStartupFails(factory, $"Storage:S3:{missing} is empty but Storage:Provider is S3");
    }

    [Fact]
    public async Task The_s3_photo_storage_with_no_setting_names_every_missing_one()
    {
        await using var factory = new DogoApiFactory(fixture.ConnectionString, new Dictionary<string, string?> { ["Storage:Provider"] = "S3" });

        var exception = Assert.ThrowsAny<Exception>(() => factory.CreateClient()).ToString();

        foreach (var key in new[] { "ServiceUrl", "Bucket", "Region", "AccessKeyId", "SecretAccessKey" })
        {
            Assert.Contains($"Storage:S3:{key}", exception, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task An_s3_service_url_that_is_not_a_url_prevents_startup()
    {
        await using var factory = new DogoApiFactory(fixture.ConnectionString, S3Settings(("ServiceUrl", "storage.example.com")));

        AssertStartupFails(factory, "Storage:S3:ServiceUrl must be an absolute http or https URL");
    }

    [Fact]
    public async Task An_unknown_photo_storage_provider_prevents_startup()
    {
        await using var factory = new DogoApiFactory(fixture.ConnectionString, new Dictionary<string, string?> { ["Storage:Provider"] = "Azure" });

        AssertStartupFails(factory, "Storage");
    }

    [Fact]
    public async Task The_s3_photo_storage_starts_when_complete_and_is_not_contacted_at_startup()
    {
        // The port is closed: the check is about the settings only, so a wrong endpoint shows on the first photo.
        await using var factory = new DogoApiFactory(fixture.ConnectionString, S3Settings());

        var response = await factory.CreateClient().GetAsync("/api/v1/health", TestContext.Current.CancellationToken);

        Assert.True(response.IsSuccessStatusCode);
        Assert.IsType<S3PhotoStorage>(factory.Services.GetRequiredService<IPhotoStorage>());
    }

    [Fact]
    public async Task The_s3_settings_are_not_checked_while_the_provider_is_local()
    {
        await using var factory = new DogoApiFactory(fixture.ConnectionString, new Dictionary<string, string?> { ["Storage:S3:Bucket"] = "" });

        Assert.True((await factory.CreateClient().GetAsync("/api/v1/health", TestContext.Current.CancellationToken)).IsSuccessStatusCode);
    }

    /// <summary>A complete S3 configuration; <paramref name="overrides"/> replace or (with null) remove values.</summary>
    private static Dictionary<string, string?> S3Settings(params (string Key, string? Value)[] overrides)
    {
        var settings = new Dictionary<string, string?>
        {
            ["Storage:Provider"] = "S3",
            ["Storage:S3:ServiceUrl"] = "http://127.0.0.1:1",
            ["Storage:S3:Bucket"] = "photos",
            ["Storage:S3:Region"] = "eu-central-1",
            ["Storage:S3:AccessKeyId"] = "key-id",
            ["Storage:S3:SecretAccessKey"] = "secret-key",
        };
        foreach (var (key, value) in overrides)
        {
            settings[$"Storage:S3:{key}"] = value;
        }

        return settings;
    }

    [Fact]
    public async Task A_photo_setting_that_cannot_be_read_prevents_startup()
    {
        await using var factory = new DogoApiFactory(
            fixture.ConnectionString, new Dictionary<string, string?> { ["Photos:MaxSide"] = "large" });

        AssertStartupFails(factory, "Photos:MaxSide");
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public async Task Demo_data_outside_development_and_testing_prevents_startup(string environment)
    {
        await using var factory = new DogoApiFactory(
            fixture.ConnectionString, ProductionSettings(("DemoData:Enabled", "true")), environment);

        AssertStartupFails(factory, "DemoData:Enabled must not be enabled");
    }

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public async Task Without_dev_tools_the_api_starts(string environment)
    {
        await using var factory = new DogoApiFactory(fixture.ConnectionString, ProductionSettings(), environment);

        var response = await factory.CreateClient().GetAsync("/api/v1/health", TestContext.Current.CancellationToken);

        Assert.True(response.IsSuccessStatusCode);
    }

    [Fact]
    public async Task The_demo_environment_starts_with_a_real_key_and_the_dev_tools_on()
    {
        // DogoApiFactory turns the dev sign-in and the demo data on for Demo, like the configuration of the hosted demo.
        await using var factory = new DogoApiFactory(fixture.ConnectionString, environment: "Demo");

        var response = await factory.CreateClient().GetAsync("/api/v1/health", TestContext.Current.CancellationToken);

        Assert.True(response.IsSuccessStatusCode);
    }

    [Fact]
    public async Task The_demo_environment_still_needs_a_connection_string()
    {
        await using var factory = new DogoApiFactory("", environment: "Demo");

        AssertStartupFails(factory, "ConnectionStrings:Dogo is empty");
    }

    [Fact]
    public async Task Demo_data_without_the_dev_sign_in_prevents_startup()
    {
        await using var factory = new DogoApiFactory(
            fixture.ConnectionString, new Dictionary<string, string?> { ["Auth:AllowDevLogin"] = "false", ["DemoData:Enabled"] = "true" });

        AssertStartupFails(factory, "DemoData:Enabled requires Auth:AllowDevLogin");
    }

    [Theory]
    [InlineData("")]
    [InlineData("too-short")]
    public async Task Missing_or_short_signing_key_prevents_startup(string signingKey)
    {
        await using var factory = new DogoApiFactory(fixture.ConnectionString, new Dictionary<string, string?> { ["Auth:Jwt:SigningKey"] = signingKey });

        AssertStartupFails(factory, "SigningKey");
    }

    [Theory]
    [InlineData("Testing")]
    [InlineData("Demo")]
    [InlineData("Staging")]
    [InlineData("Production")]
    public async Task The_committed_development_signing_key_prevents_startup_outside_development(string environment)
    {
        await using var factory = new DogoApiFactory(
            fixture.ConnectionString, ProductionSettings(("Auth:Jwt:SigningKey", JwtOptions.DevelopmentSigningKey)), environment);

        AssertStartupFails(factory, "development key");
    }

    [Fact]
    public async Task The_development_configuration_file_holds_the_known_development_key()
    {
        // Guards the constant: if the committed key changes, the check above must follow it.
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "src", "Dogo.Api", "appsettings.Development.json")))
        {
            directory = directory.Parent;
        }

        Assert.NotNull(directory);
        var path = Path.Combine(directory.FullName, "src", "Dogo.Api", "appsettings.Development.json");
        var json = await File.ReadAllTextAsync(path, TestContext.Current.CancellationToken);

        Assert.Contains($"\"{JwtOptions.DevelopmentSigningKey}\"", json, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("Staging")]
    [InlineData("Production")]
    public async Task An_empty_connection_string_prevents_startup_outside_development(string environment)
    {
        await using var factory = new DogoApiFactory("", ProductionSettings(), environment);

        AssertStartupFails(factory, "ConnectionStrings:Dogo is empty");
    }

    [Fact]
    public async Task The_log_notification_provider_prevents_startup_in_production()
    {
        await using var factory = new DogoApiFactory(
            fixture.ConnectionString, ProductionSettings(("Notifications:Provider", "Log")), "Production");

        AssertStartupFails(factory, "Notifications:Provider is Log in Production");
    }

    [Fact]
    public async Task No_apple_nor_google_audience_prevents_startup_in_production()
    {
        await using var factory = new DogoApiFactory(
            fixture.ConnectionString, ProductionSettings(("Auth:Google:Audiences:0", null)), "Production");

        AssertStartupFails(factory, "Auth:Apple:Audiences and Auth:Google:Audiences are both empty");
    }

    [Fact]
    public async Task Staging_may_use_the_log_provider_and_no_audience()
    {
        await using var factory = new DogoApiFactory(fixture.ConnectionString, environment: "Staging");

        var response = await factory.CreateClient().GetAsync("/api/v1/health", TestContext.Current.CancellationToken);

        Assert.True(response.IsSuccessStatusCode);
    }

    [Fact]
    public void A_missing_time_zone_is_a_startup_failure_outside_development()
    {
        static IReadOnlyList<string> Check(string environment, Func<string, bool> timeZoneExists) => StartupChecks.Check(
            new Environment(environment), "Host=db", PushProvider.Expo, ["com.example.app"], [], timeZoneExists);

        var failure = Assert.Single(Check("Production", _ => false));
        Assert.Contains("Europe/Paris", failure, StringComparison.Ordinal);
        Assert.Single(Check("Staging", _ => false));
        Assert.Empty(Check("Development", _ => false));
        Assert.Empty(Check("Production", id => id == "Europe/Paris"));
    }

    [Fact]
    public void Europe_paris_is_available_on_this_machine()
    {
        Assert.True(StartupChecks.TimeZoneExists(StartupChecks.RequiredTimeZone));
        Assert.False(StartupChecks.TimeZoneExists("Nowhere/Atlantis"));
    }

    private sealed class Environment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;

        public string ApplicationName { get; set; } = "Dogo.Api";

        public string ContentRootPath { get; set; } = "";

        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
