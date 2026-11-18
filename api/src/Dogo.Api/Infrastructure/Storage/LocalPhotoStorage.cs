using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Infrastructure.Storage;

public sealed class LocalStorageOptions
{
    public const string SectionName = "Storage:Local";

    /// <summary>Directory holding the photos, relative to the content root when not absolute.</summary>
    public string Path { get; set; } = "./data/photos";
}

/// <summary>Stores photos as files in a local directory.</summary>
public sealed partial class LocalPhotoStorage(IOptions<LocalStorageOptions> options, IHostEnvironment environment) : IPhotoStorage
{
    private readonly string _root = System.IO.Path.GetFullPath(options.Value.Path, environment.ContentRootPath);

    public async Task<string> SaveAsync(Stream content, string extension, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(_root);
        var fileName = $"{Guid.NewGuid():N}{extension}";
        await using var file = new FileStream(FullPath(fileName), FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true);
        await content.CopyToAsync(file, cancellationToken);
        return fileName;
    }

    public Task<Stream?> OpenReadAsync(string fileName, CancellationToken cancellationToken)
    {
        if (!IsValidFileName(fileName) || !File.Exists(FullPath(fileName)))
        {
            return Task.FromResult<Stream?>(null);
        }

        Stream stream = new FileStream(FullPath(fileName), FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
        return Task.FromResult<Stream?>(stream);
    }

    public Task DeleteAsync(string fileName, CancellationToken cancellationToken)
    {
        if (IsValidFileName(fileName))
        {
            File.Delete(FullPath(fileName));
        }

        return Task.CompletedTask;
    }

    /// <summary>Only names produced by <see cref="SaveAsync"/> are accepted, which rules out path traversal.</summary>
    public static bool IsValidFileName(string fileName) => FileNameRegex().IsMatch(fileName);

    private string FullPath(string fileName) => System.IO.Path.Combine(_root, fileName);

    [GeneratedRegex(@"^[0-9a-f]{32}\.[a-z0-9]{3,4}$")]
    private static partial Regex FileNameRegex();
}
