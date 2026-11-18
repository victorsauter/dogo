using Microsoft.Extensions.Options;

namespace Dogo.Api.Infrastructure.Push;

public static class PushSetup
{
    /// <summary>Registers <see cref="IPushSender"/> according to <c>Notifications:Provider</c> (<c>Log</c> by default).</summary>
    public static IServiceCollection AddDogoPush(this IServiceCollection services)
    {
        services.AddOptions<PushOptions>().BindConfiguration(PushOptions.SectionName);
        services.AddHttpClient(ExpoPushSender.HttpClientName, client => client.Timeout = TimeSpan.FromSeconds(15));
        services.AddSingleton<ExpoPushSender>();
        services.AddSingleton<LoggingPushSender>();

        // Resolved lazily so that test hosts can change the configuration.
        services.AddSingleton<IPushSender>(serviceProvider =>
            serviceProvider.GetRequiredService<IOptions<PushOptions>>().Value.Provider == PushProvider.Expo
                ? serviceProvider.GetRequiredService<ExpoPushSender>()
                : serviceProvider.GetRequiredService<LoggingPushSender>());
        return services;
    }
}
