namespace Dogo.Api.Features.Photos;

/// <summary>
/// Limits of the photo cleaning (ADR 0032), read from the <c>Photos</c> configuration section;
/// every value has a default, nothing needs to be configured.
/// </summary>
public sealed class PhotoProcessingOptions
{
    public const string SectionName = "Photos";

    /// <summary>Largest decoded image accepted, in pixels (width × height). Protects against decompression bombs; bounds the memory of a PNG decoded in full (4 bytes per pixel).</summary>
    public long MaxPixels { get; set; } = 25_000_000;

    /// <summary>Longest side kept, in pixels: larger images are scaled down. The app shows photos far smaller than this.</summary>
    public int MaxSide { get; set; } = 2048;

    /// <summary>Quality of re-encoded JPEG images, 1 to 100.</summary>
    public int JpegQuality { get; set; } = 90;

    /// <summary>Quality of re-encoded WebP images, 1 to 100.</summary>
    public int WebpQuality { get; set; } = 85;
}

public static class PhotoProcessingOptionsExtensions
{
    /// <summary>
    /// Registers the options: bound from <c>Photos</c>, brought back into range (a value outside
    /// its range is clamped, never refused), and read at startup so that a value that cannot be
    /// read (<c>Photos:MaxSide=abc</c>) prevents the start instead of failing the first upload.
    /// </summary>
    public static IServiceCollection AddDogoPhotoProcessing(this IServiceCollection services)
    {
        services.AddOptions<PhotoProcessingOptions>()
            .BindConfiguration(PhotoProcessingOptions.SectionName)
            .PostConfigure(options =>
            {
                options.MaxPixels = Math.Max(1, options.MaxPixels);
                options.MaxSide = Math.Clamp(options.MaxSide, 16, 16384);
                options.JpegQuality = Math.Clamp(options.JpegQuality, 1, 100);
                options.WebpQuality = Math.Clamp(options.WebpQuality, 1, 100);
            })
            .ValidateOnStart();
        return services;
    }
}
