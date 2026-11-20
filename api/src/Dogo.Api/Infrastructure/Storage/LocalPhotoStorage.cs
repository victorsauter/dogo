using Microsoft.Extensions.Options;

namespace Dogo.Api.Infrastructure.Storage;

public sealed class LocalStorageOptions
{
    public const string SectionName = "Storage:Local";

    /// <summary>Directory holding the photos, relative to the content root when not absolute.</summary>
    public string Path { get; set; } = "./data/photos";
}

/// <summary>Stores photos as files in a local directory.</summary>
public sealed partial class LocalPhotoStorage(IOptions<LocalStorageOptions> options, IHostEnvironment environment, ILogger<LocalPhotoStorage> logger) : IPhotoStorage
{
    private readonly string _root = System.IO.Path.GetFullPath(options.Value.Path, environment.ContentRootPath);

    public async Task<string> SaveAsync(Stream content, string extension, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(_root);
        var fileName = PhotoFileNames.New(extension);
        await using var file = new FileStream(FullPath(fileName), FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true);
        await content.CopyToAsync(file, cancellationToken);
        return fileName;
    }

    public Task<Stream?> OpenReadAsync(string fileName, CancellationToken cancellationToken)
    {
        if (!PhotoFileNames.IsValid(fileName) || !File.Exists(FullPath(fileName)))
        {
            return Task.FromResult<Stream?>(null);
        }

        Stream stream = new FileStream(FullPath(fileName), FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
        return Task.FromResult<Stream?>(stream);
    }

    public Task DeleteAsync(string fileName, CancellationToken cancellationToken)
    {
        if (PhotoFileNames.IsValid(fileName))
        {
            try
            {
                File.Delete(FullPath(fileName));
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            {
                // The caller already committed its change: a file left behind must not fail the request.
                LogDeleteFailed(e, fileName);
            }
        }

        return Task.CompletedTask;
    }

    private string FullPath(string fileName) => System.IO.Path.Combine(_root, fileName);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Photo file {FileName} could not be deleted and stays on disk")]
    private partial void LogDeleteFailed(Exception exception, string fileName);
}
