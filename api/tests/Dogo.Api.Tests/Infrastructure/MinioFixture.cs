using Amazon.Runtime;
using Amazon.S3;
using Dogo.Api.Infrastructure.Storage;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;

namespace Dogo.Api.Tests.Infrastructure;

/// <summary>
/// One MinIO container (an S3-compatible server) for a test class, started only by the classes that ask for it
/// (<c>IClassFixture&lt;MinioFixture&gt;</c>): the rest of the suite does not pay for it. Each test works in its own bucket.
/// Built with the generic container of Testcontainers: the <c>Testcontainers.Minio</c> module stops at 4.15.0 and does not
/// run with the 4.17.0 core that <c>Testcontainers.PostgreSql</c> brings (MissingMethodException).
/// </summary>
public sealed class MinioFixture : IAsyncLifetime
{
    /// <summary>
    /// A MinIO build with a native image for amd64 and arm64 (the Docker Hub and Quay images of MinIO itself are no
    /// longer published). The Chainguard repository only keeps <c>latest</c>: pin a digest here if a run ever has to be reproduced.
    /// </summary>
    public const string Image = "chainguard/minio:latest";

    /// <summary>Region MinIO signs with unless configured otherwise.</summary>
    public const string Region = "us-east-1";

    private const string User = "minio-test-user";
    private const string Password = "minio-test-password";
    private const int Port = 9000;

    private readonly IContainer _container = new ContainerBuilder(Image)
        .WithPortBinding(Port, assignRandomHostPort: true)
        .WithEnvironment("MINIO_ROOT_USER", User)
        .WithEnvironment("MINIO_ROOT_PASSWORD", Password)
        .WithCommand("server", "/data", "--address", $":{Port}")
        .WithWaitStrategy(Wait.ForUnixContainer().UntilHttpRequestIsSucceeded(request => request.ForPort(Port).ForPath("/minio/health/ready")))
        .Build();

    public ValueTask InitializeAsync() => new(_container.StartAsync());

    public async ValueTask DisposeAsync() => await _container.DisposeAsync();

    /// <summary>S3 settings pointing at this MinIO and the given bucket.</summary>
    public S3StorageOptions Options(string bucket) => new()
    {
        ServiceUrl = $"http://{_container.Hostname}:{_container.GetMappedPublicPort(Port)}",
        Bucket = bucket,
        Region = Region,
        AccessKeyId = User,
        SecretAccessKey = Password,
    };

    /// <summary>Creates a bucket with a unique name and returns its settings.</summary>
    public async Task<S3StorageOptions> CreateBucketAsync(CancellationToken cancellationToken)
    {
        var options = Options($"photos-{Guid.NewGuid():N}");
        using var client = S3PhotoStorage.CreateClient(options);
        await client.PutBucketAsync(options.Bucket, cancellationToken);
        return options;
    }

    /// <summary>A client with the same settings as the application's, for tests that look into the bucket.</summary>
    public static AmazonS3Client CreateClient(S3StorageOptions options) => S3PhotoStorage.CreateClient(options);

    /// <summary>A client that fails at once instead of retrying: for tests of a storage that cannot be reached.</summary>
    public static AmazonS3Client CreateClientWithoutRetries(S3StorageOptions options) => new(
        new BasicAWSCredentials(options.AccessKeyId, options.SecretAccessKey),
        new AmazonS3Config { ServiceURL = options.ServiceUrl, ForcePathStyle = true, AuthenticationRegion = options.Region, MaxErrorRetry = 0 });
}
