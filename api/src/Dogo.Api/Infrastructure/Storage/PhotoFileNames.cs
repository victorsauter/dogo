using System.Text.RegularExpressions;

namespace Dogo.Api.Infrastructure.Storage;

/// <summary>
/// The names photo files are stored under, shared by every <see cref="IPhotoStorage"/> implementation: a random
/// 128-bit name and a short extension.
/// </summary>
public static partial class PhotoFileNames
{
    /// <summary>A new random name ending with <paramref name="extension"/> (e.g. ".jpg").</summary>
    public static string New(string extension) => $"{Guid.NewGuid():N}{extension}";

    /// <summary>
    /// Only names produced by <see cref="New"/> are accepted, which rules out path traversal on disk and
    /// arbitrary object keys in a bucket.
    /// </summary>
    public static bool IsValid(string fileName) => FileNameRegex().IsMatch(fileName);

    [GeneratedRegex(@"^[0-9a-f]{32}\.[a-z0-9]{3,4}$")]
    private static partial Regex FileNameRegex();
}
