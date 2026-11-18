namespace Dogo.Api.Features.Photos;

/// <summary>
/// Limits of the photo cleaning (ADR 0032), read from the <c>Photos</c> configuration section;
/// every value has a default, nothing needs to be configured.
/// </summary>
public sealed class PhotoProcessingOptions
{
    public const string SectionName = "Photos";

    /// <summary>Largest decoded image accepted, in pixels (width × height). Protects against decompression bombs.</summary>
    public long MaxPixels { get; set; } = 40_000_000;

    /// <summary>Longest side kept, in pixels: larger images are scaled down. The app shows photos far smaller than this.</summary>
    public int MaxSide { get; set; } = 2048;

    /// <summary>Quality of re-encoded JPEG images, 1 to 100.</summary>
    public int JpegQuality { get; set; } = 90;

    /// <summary>Quality of re-encoded WebP images, 1 to 100.</summary>
    public int WebpQuality { get; set; } = 85;

    public static PhotoProcessingOptions From(IConfiguration configuration)
    {
        var options = configuration.GetSection(SectionName).Get<PhotoProcessingOptions>() ?? new PhotoProcessingOptions();
        options.MaxPixels = Math.Max(1, options.MaxPixels);
        options.MaxSide = Math.Clamp(options.MaxSide, 16, 16384);
        options.JpegQuality = Math.Clamp(options.JpegQuality, 1, 100);
        options.WebpQuality = Math.Clamp(options.WebpQuality, 1, 100);
        return options;
    }
}
