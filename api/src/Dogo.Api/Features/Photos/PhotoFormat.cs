namespace Dogo.Api.Features.Photos;

/// <summary>Accepted photo formats, recognised by their content (magic bytes), never by the declared type.</summary>
public sealed record PhotoFormat(string Extension, string ContentType)
{
    public const long MaxSizeBytes = 5 * 1024 * 1024;

    public static readonly PhotoFormat Jpeg = new(".jpg", "image/jpeg");
    public static readonly PhotoFormat Png = new(".png", "image/png");
    public static readonly PhotoFormat WebP = new(".webp", "image/webp");
    public static readonly PhotoFormat Heic = new(".heic", "image/heic");

    private static readonly PhotoFormat[] All = [Jpeg, Png, WebP, Heic];

    // ISO-BMFF brands used by HEIC/HEIF images (iPhone photos).
    private static readonly string[] HeicBrands = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];

    /// <summary>Number of leading bytes <see cref="Detect"/> needs.</summary>
    public const int HeaderLength = 12;

    public static PhotoFormat? Detect(ReadOnlySpan<byte> header)
    {
        if (header.StartsWith((ReadOnlySpan<byte>)[0xFF, 0xD8, 0xFF]))
        {
            return Jpeg;
        }

        if (header.StartsWith((ReadOnlySpan<byte>)[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
        {
            return Png;
        }

        if (header.Length >= 12 && header[..4].SequenceEqual("RIFF"u8) && header[8..12].SequenceEqual("WEBP"u8))
        {
            return WebP;
        }

        if (header.Length >= 12 && header[4..8].SequenceEqual("ftyp"u8)
            && HeicBrands.Contains(System.Text.Encoding.ASCII.GetString(header[8..12])))
        {
            return Heic;
        }

        return null;
    }

    public static string ContentTypeForFileName(string fileName) =>
        All.FirstOrDefault(f => fileName.EndsWith(f.Extension, StringComparison.Ordinal))?.ContentType ?? "application/octet-stream";
}
