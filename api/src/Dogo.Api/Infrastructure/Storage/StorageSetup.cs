using Microsoft.Extensions.Options;

namespace Dogo.Api.Infrastructure.Storage;

public static class StorageSetup
{
    /// <summary>
    /// Registers <see cref="IPhotoStorage"/> according to <c>Storage:Provider</c> (<c>Local</c> by default, or <c>S3</c>).
    /// The settings are validated at startup: a missing S3 value prevents the start instead of failing the first upload.
    /// </summary>
    public static IServiceCollection AddDogoPhotoStorage(this IServiceCollection services)
    {
        services.AddOptions<LocalStorageOptions>().BindConfiguration(LocalStorageOptions.SectionName);
        services.AddOptions<StorageOptions>().BindConfiguration(StorageOptions.SectionName).ValidateOnStart();
        services.AddSingleton<IValidateOptions<StorageOptions>, StorageOptionsValidator>();

        // Resolved lazily so that test hosts can change the configuration; only the chosen one is ever created.
        services.AddSingleton<IPhotoStorage>(serviceProvider =>
        {
            var options = serviceProvider.GetRequiredService<IOptions<StorageOptions>>().Value;
            if (options.Provider != PhotoStorageProvider.S3)
            {
                return ActivatorUtilities.CreateInstance<LocalPhotoStorage>(serviceProvider);
            }

            return new S3PhotoStorage(
                S3PhotoStorage.CreateClient(options.S3),
                options.S3.Bucket!,
                serviceProvider.GetRequiredService<ILogger<S3PhotoStorage>>());
        });
        return services;
    }
}
