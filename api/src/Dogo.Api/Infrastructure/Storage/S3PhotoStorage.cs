using System.Net;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Dogo.Api.Features.Photos;

namespace Dogo.Api.Infrastructure.Storage;

/// <summary>
/// Stores photos as objects in a bucket of an S3-compatible service (Supabase Storage, MinIO...), ADR 0043.
/// Object keys are the same random file names as on disk; the bucket stays private, the API relays the bytes.
/// Photos are small (5 MB at most, cleaned and downscaled), so a download is buffered in memory rather than
/// streamed: no connection to the storage stays open while a client reads.
/// </summary>
public sealed partial class S3PhotoStorage(IAmazonS3 client, string bucket, ILogger<S3PhotoStorage> logger) : IPhotoStorage, IDisposable
{
    /// <summary>
    /// The client for an S3-compatible service: custom endpoint, path-style addressing (the bucket is in the path, not
    /// in the host name), signing region from the configuration, and checksums only where the protocol requires them.
    /// Since AWSSDK.S3 4.x the SDK adds a checksum to uploads and validates downloads by default, which many
    /// S3-compatible services do not support; <c>WHEN_REQUIRED</c> restores the behaviour of earlier versions.
    /// </summary>
    public static AmazonS3Client CreateClient(S3StorageOptions options)
    {
        var config = new AmazonS3Config
        {
            ServiceURL = options.ServiceUrl,
            ForcePathStyle = true,
            AuthenticationRegion = options.Region,
            RequestChecksumCalculation = RequestChecksumCalculation.WHEN_REQUIRED,
            ResponseChecksumValidation = ResponseChecksumValidation.WHEN_REQUIRED,
        };
        return new AmazonS3Client(new BasicAWSCredentials(options.AccessKeyId, options.SecretAccessKey), config);
    }

    public async Task<string> SaveAsync(Stream content, string extension, CancellationToken cancellationToken)
    {
        var fileName = PhotoFileNames.New(extension);
        var body = content;
        if (!content.CanSeek)
        {
            // The SDK needs the length, and may rewind the stream on a retry.
            body = new MemoryStream();
            await content.CopyToAsync(body, cancellationToken);
            body.Position = 0;
        }

        try
        {
            await client.PutObjectAsync(
                new PutObjectRequest
                {
                    BucketName = bucket,
                    Key = fileName,
                    InputStream = body,
                    ContentType = PhotoFormat.ContentTypeForFileName(fileName),
                    AutoCloseStream = false,
                },
                cancellationToken);
        }
        finally
        {
            if (!ReferenceEquals(body, content))
            {
                await body.DisposeAsync();
            }
        }

        return fileName;
    }

    public async Task<Stream?> OpenReadAsync(string fileName, CancellationToken cancellationToken)
    {
        if (!PhotoFileNames.IsValid(fileName))
        {
            return null;
        }

        try
        {
            using var response = await client.GetObjectAsync(bucket, fileName, cancellationToken);
            var buffer = new MemoryStream();
            await response.ResponseStream.CopyToAsync(buffer, cancellationToken);
            buffer.Position = 0;
            return buffer;
        }
        catch (AmazonS3Exception e) when (e.StatusCode == HttpStatusCode.NotFound || e.ErrorCode == "NoSuchKey")
        {
            return null;
        }
    }

    public async Task DeleteAsync(string fileName, CancellationToken cancellationToken)
    {
        if (!PhotoFileNames.IsValid(fileName))
        {
            return;
        }

        try
        {
            // S3 answers success for a key that does not exist: deleting twice is harmless.
            await client.DeleteObjectAsync(bucket, fileName, cancellationToken);
        }
        catch (Exception e)
        {
            // The caller already committed its change: an object left behind must not fail the request.
            LogDeleteFailed(e, fileName);
        }
    }

    public void Dispose() => client.Dispose();

    [LoggerMessage(Level = LogLevel.Warning, Message = "Photo object {FileName} could not be deleted and stays in the bucket")]
    private partial void LogDeleteFailed(Exception exception, string fileName);
}
