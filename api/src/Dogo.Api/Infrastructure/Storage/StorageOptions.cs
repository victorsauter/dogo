using Microsoft.Extensions.Options;

namespace Dogo.Api.Infrastructure.Storage;

public enum PhotoStorageProvider
{
    /// <summary>Files in a local directory (<see cref="LocalStorageOptions"/>; default, ADR 0010).</summary>
    Local,

    /// <summary>Objects in a bucket of an S3-compatible service (<see cref="S3StorageOptions"/>; ADR 0043).</summary>
    S3,
}

/// <summary>Which photo storage is used, from the <c>Storage</c> configuration section.</summary>
public sealed class StorageOptions
{
    public const string SectionName = "Storage";

    public PhotoStorageProvider Provider { get; set; } = PhotoStorageProvider.Local;

    /// <summary>Settings of the S3 storage, read only when <see cref="Provider"/> is <see cref="PhotoStorageProvider.S3"/>.</summary>
    public S3StorageOptions S3 { get; set; } = new();
}

/// <summary>An S3-compatible bucket (Supabase Storage, MinIO, AWS S3...). The bucket stays private: the API relays the bytes.</summary>
public sealed class S3StorageOptions
{
    /// <summary>Endpoint of the S3 API (path-style addressing is always used), e.g. the S3 connection URL shown by Supabase Storage.</summary>
    public string? ServiceUrl { get; set; }

    public string? Bucket { get; set; }

    /// <summary>Region used to sign requests, e.g. <c>eu-central-1</c>.</summary>
    public string? Region { get; set; }

    public string? AccessKeyId { get; set; }

    /// <summary>Secret key. Set through the <c>Storage__S3__SecretAccessKey</c> environment variable, never in a file of the repository.</summary>
    public string? SecretAccessKey { get; set; }
}

/// <summary>Startup check: with <c>Storage:Provider=S3</c>, every S3 setting must be present (values are never echoed).</summary>
internal sealed class StorageOptionsValidator : IValidateOptions<StorageOptions>
{
    public ValidateOptionsResult Validate(string? name, StorageOptions options)
    {
        if (options.Provider != PhotoStorageProvider.S3)
        {
            return ValidateOptionsResult.Success;
        }

        var s3 = options.S3;
        var failures = new List<string>();
        Require(failures, s3.ServiceUrl, "ServiceUrl");
        Require(failures, s3.Bucket, "Bucket");
        Require(failures, s3.Region, "Region");
        Require(failures, s3.AccessKeyId, "AccessKeyId");
        Require(failures, s3.SecretAccessKey, "SecretAccessKey");
        if (!string.IsNullOrWhiteSpace(s3.ServiceUrl)
            && !(Uri.TryCreate(s3.ServiceUrl, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https"))
        {
            failures.Add("Storage:S3:ServiceUrl must be an absolute http or https URL.");
        }

        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }

    private static void Require(List<string> failures, string? value, string key)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            failures.Add($"Storage:S3:{key} is empty but Storage:Provider is S3. Set it with the Storage__S3__{key} environment variable.");
        }
    }
}
