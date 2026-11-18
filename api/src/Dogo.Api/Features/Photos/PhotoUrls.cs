namespace Dogo.Api.Features.Photos;

public static class PhotoUrls
{
    public const string RoutePrefix = "/photos";

    /// <summary>
    /// Public, origin-relative URL of a stored photo (e.g. <c>/photos/3f...e1.jpg</c>).
    /// The mobile app prefixes it with the API origin.
    /// </summary>
    public static string? For(string? fileName) => fileName is null ? null : $"{RoutePrefix}/{fileName}";
}
