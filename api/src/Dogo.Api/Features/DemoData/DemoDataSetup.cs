using Dogo.Api.Common;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Features.DemoData;

public static class DemoDataSetup
{
    /// <summary>Demo data services; the application refuses to start with <c>DemoData:Enabled</c> in Production or without the dev sign-in.</summary>
    public static IServiceCollection AddDogoDemoData(this IServiceCollection services)
    {
        services.AddOptions<DemoDataOptions>().BindConfiguration(DemoDataOptions.SectionName).ValidateOnStart();
        if (!BuildContext.IsOpenApiGeneration)
        {
            services.AddSingleton<IValidateOptions<DemoDataOptions>, DemoDataOptionsValidator>();
        }

        services.AddHttpClient(DemoPhotoFetcher.HttpClientName, (serviceProvider, client) =>
            client.Timeout = serviceProvider.GetRequiredService<IOptions<DemoDataOptions>>().Value.Photos.Timeout);
        services.AddScoped<DemoPhotoFetcher>();
        services.AddScoped<DemoDataService>();
        return services;
    }
}
