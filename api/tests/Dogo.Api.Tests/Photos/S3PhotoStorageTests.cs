using Amazon.S3;
using Amazon.S3.Model;
using Dogo.Api.Infrastructure.Storage;
using Dogo.Api.Tests.Infrastructure;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace Dogo.Api.Tests.Photos;

/// <summary>
/// <see cref="S3PhotoStorage"/> against a real S3-compatible server (MinIO in a container), ADR 0043: what the hosted
/// demo does with Supabase Storage, minus the provider itself.
/// </summary>
public sealed class S3PhotoStorageTests(MinioFixture minio) : IClassFixture<MinioFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private async Task<(S3PhotoStorage Storage, AmazonS3Client Client, S3StorageOptions Options)> CreateAsync()
    {
        var options = await minio.CreateBucketAsync(Ct);
        var storage = new S3PhotoStorage(S3PhotoStorage.CreateClient(options), options.Bucket!, NullLogger<S3PhotoStorage>.Instance);
        return (storage, MinioFixture.CreateClient(options), options);
    }

    private static async Task<byte[]> ReadAllAsync(Stream stream)
    {
        await using var _ = stream;
        using var copy = new MemoryStream();
        await stream.CopyToAsync(copy, Ct);
        return copy.ToArray();
    }

    [Fact]
    public async Task A_saved_photo_is_read_back_under_a_random_name_with_its_content_type()
    {
        var (storage, client, options) = await CreateAsync();
        using var _ = storage;
        using var __ = client;
        var bytes = TestImages.Jpeg();

        var name = await storage.SaveAsync(new MemoryStream(bytes), ".jpg", Ct);

        Assert.Matches("^[0-9a-f]{32}\\.jpg$", name);
        var stream = await storage.OpenReadAsync(name, Ct);
        Assert.NotNull(stream);
        Assert.Equal(bytes, await ReadAllAsync(stream));
        var metadata = await client.GetObjectMetadataAsync(options.Bucket, name, Ct);
        Assert.Equal("image/jpeg", metadata.Headers.ContentType);
    }

    [Fact]
    public async Task Two_photos_get_two_names()
    {
        var (storage, client, _) = await CreateAsync();
        using var _1 = storage;
        using var _2 = client;

        var first = await storage.SaveAsync(new MemoryStream(TestImages.Png()), ".png", Ct);
        var second = await storage.SaveAsync(new MemoryStream(TestImages.Png()), ".png", Ct);

        Assert.NotEqual(first, second);
    }

    [Fact]
    public async Task A_stream_that_cannot_seek_is_saved_too()
    {
        var (storage, client, _) = await CreateAsync();
        using var _1 = storage;
        using var _2 = client;
        var bytes = TestImages.WebP();

        var name = await storage.SaveAsync(new ForwardOnlyStream(bytes), ".webp", Ct);

        var stream = await storage.OpenReadAsync(name, Ct);
        Assert.NotNull(stream);
        Assert.Equal(bytes, await ReadAllAsync(stream));
    }

    [Fact]
    public async Task A_missing_object_is_null()
    {
        var (storage, client, _) = await CreateAsync();
        using var _1 = storage;
        using var _2 = client;

        Assert.Null(await storage.OpenReadAsync($"{Guid.NewGuid():N}.jpg", Ct));
    }

    [Theory]
    [InlineData("")]
    [InlineData("photo.jpg")]
    [InlineData("../../etc/passwd")]
    [InlineData("0123456789abcdef0123456789abcdef")]
    [InlineData("0123456789ABCDEF0123456789ABCDEF.jpg")]
    [InlineData("0123456789abcdef0123456789abcdef.jpg/")]
    public async Task An_invalid_name_is_null_even_when_an_object_has_that_key(string name)
    {
        var (storage, client, options) = await CreateAsync();
        using var _1 = storage;
        using var _2 = client;
        if (name.Length > 0 && !name.Contains("..", StringComparison.Ordinal) && !name.EndsWith('/'))
        {
            await client.PutObjectAsync(new PutObjectRequest { BucketName = options.Bucket, Key = name, ContentBody = "x" }, Ct);
        }

        Assert.Null(await storage.OpenReadAsync(name, Ct));
    }

    [Fact]
    public async Task Deleting_removes_the_object_and_is_idempotent()
    {
        var (storage, client, options) = await CreateAsync();
        using var _1 = storage;
        using var _2 = client;
        var name = await storage.SaveAsync(new MemoryStream(TestImages.Jpeg()), ".jpg", Ct);

        await storage.DeleteAsync(name, Ct);
        await storage.DeleteAsync(name, Ct);
        await storage.DeleteAsync($"{Guid.NewGuid():N}.jpg", Ct);

        Assert.Null(await storage.OpenReadAsync(name, Ct));
        Assert.Empty((await client.ListObjectsV2Async(new ListObjectsV2Request { BucketName = options.Bucket }, Ct)).S3Objects ?? []);
    }

    [Fact]
    public async Task Deleting_an_invalid_name_does_nothing()
    {
        var (storage, client, options) = await CreateAsync();
        using var _1 = storage;
        using var _2 = client;
        await client.PutObjectAsync(new PutObjectRequest { BucketName = options.Bucket, Key = "keep.txt", ContentBody = "x" }, Ct);

        await storage.DeleteAsync("keep.txt", Ct);
        await storage.DeleteAsync("../keep.txt", Ct);

        Assert.Single((await client.ListObjectsV2Async(new ListObjectsV2Request { BucketName = options.Bucket }, Ct)).S3Objects);
    }

    [Fact]
    public async Task Deleting_never_throws_when_the_storage_cannot_be_reached_and_logs_a_warning()
    {
        // Nothing listens on port 1: the delete fails, and the caller (which already committed) must not.
        var options = new S3StorageOptions { ServiceUrl = "http://127.0.0.1:1", Bucket = "photos", Region = MinioFixture.Region, AccessKeyId = "a", SecretAccessKey = "b" };
        var logger = new RecordingLogger();
        using var storage = new S3PhotoStorage(MinioFixture.CreateClientWithoutRetries(options), "photos", logger);

        await storage.DeleteAsync($"{Guid.NewGuid():N}.jpg", Ct);

        Assert.Contains(logger.Entries, e => e is (LogLevel.Warning, var message) && message.Contains("could not be deleted", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Reading_fails_loudly_when_the_storage_cannot_be_reached()
    {
        // Only "not found" means null: a broken storage must not look like a missing photo.
        var options = new S3StorageOptions { ServiceUrl = "http://127.0.0.1:1", Bucket = "photos", Region = MinioFixture.Region, AccessKeyId = "a", SecretAccessKey = "b" };
        using var storage = new S3PhotoStorage(MinioFixture.CreateClientWithoutRetries(options), "photos", NullLogger<S3PhotoStorage>.Instance);

        await Assert.ThrowsAnyAsync<Exception>(() => storage.OpenReadAsync($"{Guid.NewGuid():N}.jpg", Ct));
    }

    private sealed class ForwardOnlyStream(byte[] bytes) : Stream
    {
        private readonly MemoryStream _inner = new(bytes);

        public override bool CanRead => true;

        public override bool CanSeek => false;

        public override bool CanWrite => false;

        public override long Length => throw new NotSupportedException();

        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }

        public override void Flush()
        {
        }

        public override int Read(byte[] buffer, int offset, int count) => _inner.Read(buffer, offset, count);

        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();

        public override void SetLength(long value) => throw new NotSupportedException();

        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }

    private sealed class RecordingLogger : ILogger<S3PhotoStorage>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, formatter(state, exception)));
    }
}
