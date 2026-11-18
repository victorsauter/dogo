using System.Buffers.Binary;
using System.IO.Compression;
using System.Text;
using SkiaSharp;

namespace Dogo.Api.Tests.Infrastructure;

/// <summary>
/// Images generated in code (no binary file in the repository): real, decodable JPEG, PNG and WebP
/// images, with hand-made metadata when a test needs some, plus headers-only fakes of other formats.
/// </summary>
public static class TestImages
{
    public static readonly SKColor Red = new(220, 30, 30);
    public static readonly SKColor Green = new(30, 200, 30);
    public static readonly SKColor Blue = new(30, 30, 220);
    public static readonly SKColor Yellow = new(230, 220, 30);

    public const string GpsMarker = "Exif";
    public const string CommentMarker = "secret-comment-4f9a";
    public const string XmpMarker = "http://ns.adobe.com/xap/1.0/";
    public const string IptcMarker = "Photoshop 3.0";

    /// <summary>A small JPEG. A larger <paramref name="size"/> pads the file with bytes after the end marker, to exactly that many bytes.</summary>
    public static byte[] Jpeg(int size = 0) => Pad(Encode(Quadrants(64, 64), SKEncodedImageFormat.Jpeg), size);

    public static byte[] Png() => Encode(Quadrants(64, 64), SKEncodedImageFormat.Png);

    public static byte[] WebP() => Encode(Quadrants(64, 64), SKEncodedImageFormat.Webp);

    /// <summary>A header-only fake: ISO-BMFF « heic » brand, never decodable by the API.</summary>
    public static byte[] Heic(int size = 64) => PadFake("\0\0\0\u0018ftypheic"u8.ToArray(), size);

    public static byte[] Gif(int size = 64) => PadFake("GIF89a"u8.ToArray(), size);

    public static byte[] Text(int size = 64) => PadFake("hello, this is not an image"u8.ToArray(), size);

    /// <summary>A valid JPEG header followed by bytes that are not an image.</summary>
    public static byte[] BrokenJpeg() => PadFake([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01], 4096);

    /// <summary>A valid PNG signature followed by bytes that are not an image.</summary>
    public static byte[] BrokenPng() => PadFake([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D], 4096);

    /// <summary>A real JPEG cut in half.</summary>
    public static byte[] TruncatedJpeg()
    {
        var jpeg = Jpeg();
        return jpeg[..(jpeg.Length / 2)];
    }

    /// <summary>
    /// A JPEG of <paramref name="width"/> × <paramref name="height"/> with, in this order: the EXIF orientation,
    /// a GPS position (47°31'59" N, 7°11'05" E) in the EXIF, an XMP packet, an IPTC block and a comment.
    /// Its quadrants are red, green (top), blue, yellow (bottom).
    /// </summary>
    public static byte[] JpegWithMetadata(int orientation = 1, int width = 40, int height = 20)
    {
        var jpeg = Encode(Quadrants(width, height), SKEncodedImageFormat.Jpeg);
        using var output = new MemoryStream();
        output.Write(jpeg, 0, 2); // SOI
        WriteSegment(output, 0xE1, [.. "Exif\0\0"u8, .. ExifPayload(orientation)]);
        WriteSegment(output, 0xE1, [.. Encoding.ASCII.GetBytes(XmpMarker + "\0"), .. "<x:xmpmeta>owner: Camille</x:xmpmeta>"u8]);
        WriteSegment(output, 0xED, [.. Encoding.ASCII.GetBytes(IptcMarker + "\0"), .. "8BIM caption: at home"u8]);
        WriteSegment(output, 0xFE, Encoding.ASCII.GetBytes(CommentMarker));
        output.Write(jpeg, 2, jpeg.Length - 2);
        return output.ToArray();
    }

    /// <summary>A grayscale PNG with a valid, tiny-to-store content of <paramref name="width"/> × <paramref name="height"/> pixels.</summary>
    public static byte[] LargePng(int width, int height)
    {
        using var output = new MemoryStream();
        output.Write([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

        var header = new byte[13];
        BinaryPrimitives.WriteInt32BigEndian(header, width);
        BinaryPrimitives.WriteInt32BigEndian(header.AsSpan(4), height);
        header[8] = 8; // bit depth
        header[9] = 0; // grayscale
        WriteChunk(output, "IHDR", header);

        using var compressed = new MemoryStream();
        using (var zlib = new ZLibStream(compressed, CompressionLevel.SmallestSize, leaveOpen: true))
        {
            var row = new byte[width + 1]; // filter byte 0, then black pixels
            for (var y = 0; y < height; y++)
            {
                zlib.Write(row);
            }
        }

        WriteChunk(output, "IDAT", compressed.ToArray());
        WriteChunk(output, "IEND", []);
        return output.ToArray();
    }

    /// <summary>A plain image: <paramref name="width"/> × <paramref name="height"/>, one colour, for the size tests.</summary>
    public static byte[] SolidJpeg(int width, int height)
    {
        using var bitmap = new SKBitmap(width, height);
        bitmap.Erase(Blue);
        return Encode(bitmap, SKEncodedImageFormat.Jpeg);
    }

    /// <summary>Colour of the pixel at the middle of quadrant (<paramref name="column"/>, <paramref name="row"/>) in 0 or 1.</summary>
    public static SKColor QuadrantColor(SKBitmap bitmap, int column, int row) =>
        bitmap.GetPixel((bitmap.Width * ((column * 2) + 1)) / 4, (bitmap.Height * ((row * 2) + 1)) / 4);

    /// <summary>The nearest of the four test colours.</summary>
    public static SKColor Nearest(SKColor color) => new[] { Red, Green, Blue, Yellow }
        .MinBy(c => Math.Pow(c.Red - color.Red, 2) + Math.Pow(c.Green - color.Green, 2) + Math.Pow(c.Blue - color.Blue, 2));

    /// <summary>Marker bytes of the segments before the image data of a JPEG (APPn, COM, DQT…).</summary>
    public static IReadOnlyList<byte> JpegMarkers(byte[] jpeg)
    {
        var markers = new List<byte>();
        var i = 2;
        while (i + 4 <= jpeg.Length && jpeg[i] == 0xFF)
        {
            var marker = jpeg[i + 1];
            markers.Add(marker);
            if (marker == 0xDA)
            {
                break;
            }

            i += 2 + BinaryPrimitives.ReadUInt16BigEndian(jpeg.AsSpan(i + 2));
        }

        return markers;
    }

    public static bool Contains(byte[] content, string text) => content.AsSpan().IndexOf(Encoding.ASCII.GetBytes(text)) >= 0;

    private static SKBitmap Quadrants(int width, int height)
    {
        var bitmap = new SKBitmap(width, height);
        using var canvas = new SKCanvas(bitmap);
        var (halfW, halfH) = (width / 2f, height / 2f);
        using var paint = new SKPaint();
        foreach (var (color, x, y) in new[] { (Red, 0f, 0f), (Green, halfW, 0f), (Blue, 0f, halfH), (Yellow, halfW, halfH) })
        {
            paint.Color = color;
            canvas.DrawRect(x, y, halfW, halfH, paint);
        }

        return bitmap;
    }

    private static byte[] Encode(SKBitmap bitmap, SKEncodedImageFormat format)
    {
        using (bitmap)
        using (var image = SKImage.FromBitmap(bitmap))
        using (var data = image.Encode(format, 95))
        {
            return data.ToArray();
        }
    }

    private static byte[] Pad(byte[] image, int size)
    {
        if (size <= image.Length)
        {
            return image;
        }

        var padded = new byte[size];
        image.CopyTo(padded, 0);
        for (var i = image.Length; i < size; i++)
        {
            padded[i] = (byte)(i % 251);
        }

        return padded;
    }

    private static byte[] PadFake(byte[] header, int size)
    {
        var bytes = new byte[Math.Max(size, header.Length)];
        header.CopyTo(bytes, 0);
        for (var i = header.Length; i < bytes.Length; i++)
        {
            bytes[i] = (byte)(i % 251);
        }

        return bytes;
    }

    private static void WriteSegment(Stream output, byte marker, byte[] payload)
    {
        output.WriteByte(0xFF);
        output.WriteByte(marker);
        Span<byte> length = stackalloc byte[2];
        BinaryPrimitives.WriteUInt16BigEndian(length, (ushort)(payload.Length + 2));
        output.Write(length);
        output.Write(payload);
    }

    /// <summary>A big-endian TIFF structure: orientation and a GPS IFD (north, east).</summary>
    private static byte[] ExifPayload(int orientation)
    {
        var tiff = new byte[140];
        var span = tiff.AsSpan();
        "MM"u8.CopyTo(span);
        BinaryPrimitives.WriteUInt16BigEndian(span[2..], 42);
        BinaryPrimitives.WriteUInt32BigEndian(span[4..], 8);

        // IFD0 at 8: orientation, pointer to the GPS IFD at 38.
        BinaryPrimitives.WriteUInt16BigEndian(span[8..], 2);
        Entry(span[10..], 0x0112, 3, 1, (uint)orientation << 16);
        Entry(span[22..], 0x8825, 4, 1, 38);

        // GPS IFD at 38: latitude and longitude with their references; rationals at 92 and 116.
        BinaryPrimitives.WriteUInt16BigEndian(span[38..], 4);
        Entry(span[40..], 0x0001, 2, 2, (uint)'N' << 24);
        Entry(span[52..], 0x0002, 5, 3, 92);
        Entry(span[64..], 0x0003, 2, 2, (uint)'E' << 24);
        Entry(span[76..], 0x0004, 5, 3, 116);
        Rationals(span[92..], 47, 31, 59);
        Rationals(span[116..], 7, 11, 5);
        return tiff;
    }

    private static void Entry(Span<byte> span, ushort tag, ushort type, uint count, uint value)
    {
        BinaryPrimitives.WriteUInt16BigEndian(span, tag);
        BinaryPrimitives.WriteUInt16BigEndian(span[2..], type);
        BinaryPrimitives.WriteUInt32BigEndian(span[4..], count);
        BinaryPrimitives.WriteUInt32BigEndian(span[8..], value);
    }

    private static void Rationals(Span<byte> span, params uint[] numerators)
    {
        for (var i = 0; i < numerators.Length; i++)
        {
            BinaryPrimitives.WriteUInt32BigEndian(span[(i * 8)..], numerators[i]);
            BinaryPrimitives.WriteUInt32BigEndian(span[((i * 8) + 4)..], 1);
        }
    }

    private static void WriteChunk(Stream output, string type, byte[] data)
    {
        Span<byte> number = stackalloc byte[4];
        BinaryPrimitives.WriteInt32BigEndian(number, data.Length);
        output.Write(number);
        var body = Encoding.ASCII.GetBytes(type).Concat(data).ToArray();
        output.Write(body);
        BinaryPrimitives.WriteUInt32BigEndian(number, Crc32(body));
        output.Write(number);
    }

    private static uint Crc32(byte[] bytes)
    {
        var crc = 0xFFFFFFFFu;
        foreach (var b in bytes)
        {
            crc ^= b;
            for (var k = 0; k < 8; k++)
            {
                crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xEDB88320u : crc >> 1;
            }
        }

        return ~crc;
    }
}
