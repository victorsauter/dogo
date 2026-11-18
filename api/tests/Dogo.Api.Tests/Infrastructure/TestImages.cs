namespace Dogo.Api.Tests.Infrastructure;

/// <summary>Minimal byte sequences carrying the magic bytes of each format.</summary>
public static class TestImages
{
    public static byte[] Jpeg(int size = 64) => Pad([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01], size);

    public static byte[] Png(int size = 64) => Pad([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D], size);

    public static byte[] WebP(int size = 64) => Pad("RIFF\0\0\0\0WEBPVP8 "u8.ToArray(), size);

    public static byte[] Heic(int size = 64) => Pad("\0\0\0\u0018ftypheic"u8.ToArray(), size);

    public static byte[] Gif(int size = 64) => Pad("GIF89a"u8.ToArray(), size);

    public static byte[] Text(int size = 64) => Pad("hello, this is not an image"u8.ToArray(), size);

    private static byte[] Pad(byte[] header, int size)
    {
        var bytes = new byte[Math.Max(size, header.Length)];
        header.CopyTo(bytes, 0);
        for (var i = header.Length; i < bytes.Length; i++)
        {
            bytes[i] = (byte)(i % 251);
        }

        return bytes;
    }
}
