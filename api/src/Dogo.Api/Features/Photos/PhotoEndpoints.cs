using System.Security.Claims;
using Dogo.Api.Common;
using Dogo.Api.Features.Dogs;
using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Auth;
using Dogo.Api.Infrastructure.Persistence;
using Dogo.Api.Infrastructure.Storage;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Features.Photos;

public static class PhotoEndpoints
{
    // Room for the 5 MB photo plus multipart overhead; Kestrel cuts larger bodies off with 413.
    private const long MaxRequestBytes = PhotoFormat.MaxSizeBytes + (1024 * 1024);

    /// <summary>Upload endpoints, under the versioned API group.</summary>
    public static IEndpointRouteBuilder MapPhotoEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("")
            .WithTags("Photos")
            .DisableAntiforgery()
            .WithMetadata(new RequestSizeLimitAttribute(MaxRequestBytes))
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge)
            .ProducesProblem(StatusCodes.Status415UnsupportedMediaType);

        group.MapPut("/me/photo", UploadMyPhoto)
            .WithName("uploadMyPhoto")
            .WithSummary("Upload or replace the signed-in user's photo (JPEG, PNG, WebP or HEIC, 5 MB max).");

        group.MapPut("/dogs/{id:guid}/photo", UploadDogPhoto)
            .WithName("uploadDogPhoto")
            .WithSummary("Upload or replace a dog's photo (JPEG, PNG, WebP or HEIC, 5 MB max).")
            .ProducesProblem(StatusCodes.Status404NotFound);

        return routes;
    }

    /// <summary>
    /// Serves stored photos at <c>/photos/{fileName}</c>, outside the versioned API. Anonymous:
    /// file names are random and unguessable, which lets the app display them as plain image URLs.
    /// </summary>
    public static IEndpointRouteBuilder MapPhotoFiles(this IEndpointRouteBuilder routes)
    {
        routes.MapGet(PhotoUrls.RoutePrefix + "/{fileName}", GetPhoto)
            .AllowAnonymous()
            .ExcludeFromDescription();
        return routes;
    }

    private static async Task<Results<Ok<MeResponse>, ProblemHttpResult>> UploadMyPhoto(
        IFormFile? file,
        ClaimsPrincipal principal,
        DogoDbContext db,
        IPhotoStorage storage,
        IOptions<AdminOptions> admin,
        CancellationToken cancellationToken)
    {
        var user = await db.Users.FindAsync([principal.GetUserId()], cancellationToken);
        if (user is null)
        {
            return Problems.Unauthorized(ErrorCodes.Unauthenticated, "The account no longer exists.");
        }

        var (fileName, problem) = await SaveAsync(file, storage, cancellationToken);
        if (fileName is null)
        {
            return problem!;
        }

        var previous = user.PhotoFileName;
        user.PhotoFileName = fileName;
        await db.SaveChangesAsync(cancellationToken);
        await DeletePreviousAsync(storage, previous, cancellationToken);
        return TypedResults.Ok(MeResponse.From(user, admin.Value));
    }

    private static async Task<Results<Ok<DogResponse>, ProblemHttpResult>> UploadDogPhoto(
        Guid id,
        IFormFile? file,
        ClaimsPrincipal principal,
        DogoDbContext db,
        IPhotoStorage storage,
        CancellationToken cancellationToken)
    {
        var (dog, ownershipProblem) = await DogEndpoints.FindOwnedDogAsync(db, id, principal, cancellationToken);
        if (dog is null)
        {
            return ownershipProblem!;
        }

        var (fileName, problem) = await SaveAsync(file, storage, cancellationToken);
        if (fileName is null)
        {
            return problem!;
        }

        var previous = dog.PhotoFileName;
        dog.PhotoFileName = fileName;
        await db.SaveChangesAsync(cancellationToken);
        await DeletePreviousAsync(storage, previous, cancellationToken);
        return TypedResults.Ok(DogResponse.From(dog));
    }

    private static async Task<Results<FileStreamHttpResult, ProblemHttpResult>> GetPhoto(
        string fileName, IPhotoStorage storage, HttpContext context, CancellationToken cancellationToken)
    {
        var stream = await storage.OpenReadAsync(fileName, cancellationToken);
        if (stream is null)
        {
            return Problems.NotFound(ErrorCodes.PhotoNotFound, "The photo does not exist.");
        }

        // A file name is never reused: the content behind a URL never changes.
        context.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
        return TypedResults.Stream(stream, PhotoFormat.ContentTypeForFileName(fileName));
    }

    /// <summary>Checks size and real format, then stores the file. Returns the stored name or a problem.</summary>
    private static async Task<(string? FileName, ProblemHttpResult? Problem)> SaveAsync(
        IFormFile? file, IPhotoStorage storage, CancellationToken cancellationToken)
    {
        if (file is null || file.Length == 0)
        {
            return (null, Problems.Validation("file", "A photo file is required."));
        }

        if (file.Length > PhotoFormat.MaxSizeBytes)
        {
            return (null, Problems.Create(StatusCodes.Status413PayloadTooLarge, ErrorCodes.PhotoTooLarge, "The photo exceeds 5 MB."));
        }

        await using var stream = file.OpenReadStream();
        var header = new byte[PhotoFormat.HeaderLength];
        var read = await stream.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false, cancellationToken);
        var format = PhotoFormat.Detect(header.AsSpan(0, read));
        if (format is null)
        {
            return (null, Problems.Create(
                StatusCodes.Status415UnsupportedMediaType,
                ErrorCodes.PhotoUnsupportedType,
                "The photo must be a JPEG, PNG, WebP or HEIC image."));
        }

        stream.Position = 0;
        return (await storage.SaveAsync(stream, format.Extension, cancellationToken), null);
    }

    private static async Task DeletePreviousAsync(IPhotoStorage storage, string? previous, CancellationToken cancellationToken)
    {
        if (previous is not null)
        {
            await storage.DeleteAsync(previous, cancellationToken);
        }
    }
}
