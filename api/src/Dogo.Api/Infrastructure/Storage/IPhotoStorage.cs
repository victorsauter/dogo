namespace Dogo.Api.Infrastructure.Storage;

/// <summary>
/// Stores photo files under opaque, random file names. The implementation is chosen at
/// startup (local disk for now, see ADR 0010); callers only keep the returned file name.
/// </summary>
public interface IPhotoStorage
{
    /// <summary>Saves the content under a new random name ending with <paramref name="extension"/> (e.g. ".jpg").</summary>
    Task<string> SaveAsync(Stream content, string extension, CancellationToken cancellationToken);

    /// <summary>Opens a stored file, or returns null when it does not exist.</summary>
    Task<Stream?> OpenReadAsync(string fileName, CancellationToken cancellationToken);

    /// <summary>Deletes a stored file; does nothing when it does not exist.</summary>
    Task DeleteAsync(string fileName, CancellationToken cancellationToken);
}
