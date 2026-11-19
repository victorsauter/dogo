using SkiaSharp;

namespace Dogo.Api.Features.Photos;

/// <summary>Why a photo was not accepted.</summary>
public enum PhotoRejection
{
    /// <summary>Not a JPEG, PNG or WebP image, or the content cannot be decoded.</summary>
    UnsupportedFormat,

    /// <summary>The decoded image has more pixels than <see cref="PhotoProcessingOptions.MaxPixels"/>.</summary>
    TooManyPixels,
}

/// <summary>A cleaned photo: the bytes to store and their real format.</summary>
public sealed record ProcessedPhoto(byte[] Content, PhotoFormat Format);

/// <summary>
/// Cleans every photo before it is stored (ADR 0032): the image is decoded then written again from
/// its pixels only, so no metadata survives (EXIF with the GPS position, XMP, IPTC, comments, original
/// colour profile) and nothing hidden behind a valid header either. The EXIF orientation is applied
/// to the pixels, the image is scaled down above <see cref="PhotoProcessingOptions.MaxSide"/>, and
/// an image with too many pixels or that does not decode is refused.
/// </summary>
public sealed class PhotoProcessor(PhotoProcessingOptions options)
{
    // Decoding holds a bitmap (4 bytes per pixel) in memory: one image at a time, so the peak per
    // upload is bounded and documented (ADR 0032).
    private static readonly SemaphoreSlim Gate = new(1, 1);

    public async Task<(ProcessedPhoto? Photo, PhotoRejection? Rejection)> ProcessAsync(byte[] content, CancellationToken cancellationToken)
    {
        var format = PhotoFormat.Detect(content.AsSpan(0, Math.Min(content.Length, PhotoFormat.HeaderLength)));
        if (format is null)
        {
            return (null, PhotoRejection.UnsupportedFormat);
        }

        await Gate.WaitAsync(cancellationToken);
        try
        {
            return await Task.Run(() => Process(content, format), cancellationToken);
        }
        finally
        {
            Gate.Release();
        }
    }

    private (ProcessedPhoto? Photo, PhotoRejection? Rejection) Process(byte[] content, PhotoFormat format)
    {
        try
        {
            using var stream = new SKMemoryStream(content);
            using var codec = SKCodec.Create(stream, out var created);
            if (codec is null || created != SKCodecResult.Success || codec.EncodedFormat != SkiaFormat(format))
            {
                return (null, PhotoRejection.UnsupportedFormat);
            }

            var (width, height) = (codec.Info.Width, codec.Info.Height);
            if (width <= 0 || height <= 0)
            {
                return (null, PhotoRejection.UnsupportedFormat);
            }

            // Checked on the header, before any pixel is allocated.
            if ((long)width * height > options.MaxPixels)
            {
                return (null, PhotoRejection.TooManyPixels);
            }

            // Decoded at reduced size when the format allows it (JPEG and WebP), so that the full
            // resolution of a very large image is never allocated.
            var (decodeWidth, decodeHeight) = DecodeSize(codec, width, height);

            // sRGB: colours are converted from the embedded profile, which is then dropped.
            var info = new SKImageInfo(decodeWidth, decodeHeight, SKColorType.Rgba8888, SKAlphaType.Premul, SKColorSpace.CreateSrgb());
            using var decoded = new SKBitmap(info);
            if (codec.GetPixels(info, decoded.GetPixels()) != SKCodecResult.Success)
            {
                return (null, PhotoRejection.UnsupportedFormat);
            }

            // Immutable: drawing from it or encoding it does not copy the pixels.
            decoded.SetImmutable();

            // Only when the image must be turned or scaled is a second bitmap (at most MaxSide × MaxSide) allocated.
            using var transformed = Transform(decoded, codec.EncodedOrigin);
            using var encoded = (transformed ?? decoded).Encode(SkiaFormat(format), format == PhotoFormat.WebP ? options.WebpQuality : options.JpegQuality);
            return encoded is null ? (null, PhotoRejection.UnsupportedFormat) : (new ProcessedPhoto(encoded.ToArray(), format), null);
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            // Native decoders signal broken files in many ways; whatever the way, the photo is refused.
            return (null, PhotoRejection.UnsupportedFormat);
        }
    }

    private static SKEncodedImageFormat SkiaFormat(PhotoFormat format) =>
        format == PhotoFormat.Jpeg ? SKEncodedImageFormat.Jpeg
        : format == PhotoFormat.Png ? SKEncodedImageFormat.Png
        : SKEncodedImageFormat.Webp;

    /// <summary>
    /// Size to decode at: the full size, or, above <see cref="PhotoProcessingOptions.MaxSide"/>, the smallest size the
    /// codec produces natively (JPEG: 1/2, 1/4, 1/8 steps; WebP) whose longest side stays at least <c>MaxSide</c>.
    /// PNG cannot be decoded scaled and is decoded in full (hence the cap on pixels).
    /// </summary>
    private (int Width, int Height) DecodeSize(SKCodec codec, int width, int height)
    {
        var longest = Math.Max(width, height);
        if (longest <= options.MaxSide)
        {
            return (width, height);
        }

        // The codec rounds to the sizes it supports, possibly below the requested one (JPEG: 1/8 steps):
        // when that is too small, ask for the next multiple of 1/8.
        var desired = (float)options.MaxSide / longest;
        foreach (var scale in new[] { desired, MathF.Ceiling(desired * 8) / 8 })
        {
            var scaled = codec.GetScaledDimensions(scale);
            if (Math.Max(scaled.Width, scaled.Height) >= options.MaxSide && scaled.Width <= width && scaled.Height <= height)
            {
                return (scaled.Width, scaled.Height);
            }
        }

        return (width, height);
    }

    /// <summary>
    /// Applies the EXIF orientation to the pixels and scales down to <see cref="PhotoProcessingOptions.MaxSide"/>.
    /// Returns null, with no copy, when the image needs neither.
    /// </summary>
    private SKBitmap? Transform(SKBitmap source, SKEncodedOrigin origin)
    {
        var (w, h) = (source.Width, source.Height);
        var swapped = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop
            or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var (orientedWidth, orientedHeight) = swapped ? (h, w) : (w, h);
        var scale = Math.Min(1f, (float)options.MaxSide / Math.Max(orientedWidth, orientedHeight));

        if (origin == SKEncodedOrigin.TopLeft && scale >= 1f)
        {
            return null;
        }

        var targetWidth = Math.Max(1, (int)Math.Round(orientedWidth * scale));
        var targetHeight = Math.Max(1, (int)Math.Round(orientedHeight * scale));
        var target = new SKBitmap(new SKImageInfo(targetWidth, targetHeight, SKColorType.Rgba8888, SKAlphaType.Premul, SKColorSpace.CreateSrgb()));
        using var canvas = new SKCanvas(target);
        canvas.Clear(SKColors.Transparent);
        canvas.Scale((float)targetWidth / orientedWidth, (float)targetHeight / orientedHeight);
        canvas.Concat(OriginMatrix(origin, w, h));
        using var sourceImage = SKImage.FromBitmap(source); // shares the immutable pixels
        canvas.DrawImage(sourceImage, 0, 0, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
        return target;
    }

    /// <summary>Maps the stored pixels (w × h) to the upright image, per the EXIF orientation values 1 to 8.</summary>
    private static SKMatrix OriginMatrix(SKEncodedOrigin origin, int w, int h) => origin switch
    {
        SKEncodedOrigin.TopRight => Matrix(-1, 0, w, 0, 1, 0),
        SKEncodedOrigin.BottomRight => Matrix(-1, 0, w, 0, -1, h),
        SKEncodedOrigin.BottomLeft => Matrix(1, 0, 0, 0, -1, h),
        SKEncodedOrigin.LeftTop => Matrix(0, 1, 0, 1, 0, 0),
        SKEncodedOrigin.RightTop => Matrix(0, -1, h, 1, 0, 0),
        SKEncodedOrigin.RightBottom => Matrix(0, -1, h, -1, 0, w),
        SKEncodedOrigin.LeftBottom => Matrix(0, 1, 0, -1, 0, w),
        _ => SKMatrix.Identity,
    };

    // x' = a·x + b·y + tx ; y' = c·x + d·y + ty
    private static SKMatrix Matrix(float a, float b, float tx, float c, float d, float ty) =>
        new() { ScaleX = a, SkewX = b, TransX = tx, SkewY = c, ScaleY = d, TransY = ty, Persp0 = 0, Persp1 = 0, Persp2 = 1 };
}
