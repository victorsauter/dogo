using Dogo.Api.Features.Dogs;
using Dogo.Api.Features.Photos;
using Dogo.Api.Infrastructure.Auth;

namespace Dogo.Api.Features.Users;

/// <summary>The signed-in user's own profile (<c>GET /me</c>). The only place where the e-mail appears.</summary>
public sealed record MeResponse(
    Guid Id,
    string DisplayName,
    string Bio,
    string? PhotoUrl,
    string? Email,
    UserStatus Status,
    bool IsAdmin,
    DateTimeOffset CreatedAt)
{
    public static MeResponse From(User user, AdminOptions admin) => new(
        user.Id,
        user.DisplayName,
        user.Bio,
        PhotoUrls.For(user.PhotoFileName),
        user.Email,
        user.Status,
        // The full rule (ADR 0031): a suspended account, or a dev account outside Development
        // and Testing, is not shown as an administrator.
        admin.IsAdmin(user.Provider, user.Status, user.Email),
        user.CreatedAt);
}

/// <summary>Public profile of a user with their dogs (<c>GET /users/{id}</c>). Never contains the e-mail.</summary>
public sealed record PublicUserResponse(
    Guid Id,
    string DisplayName,
    string Bio,
    string? PhotoUrl,
    IReadOnlyList<DogResponse> Dogs)
{
    public static PublicUserResponse From(User user, IEnumerable<Dog> dogs) => new(
        user.Id,
        user.DisplayName,
        user.Bio,
        PhotoUrls.For(user.PhotoFileName),
        dogs.Select(DogResponse.From).ToList());
}

/// <summary>A user as shown next to a walk, a participant or (later) a message.</summary>
public sealed record UserSummaryResponse(Guid Id, string DisplayName, string? PhotoUrl)
{
    public static UserSummaryResponse From(User user) => new(user.Id, user.DisplayName, PhotoUrls.For(user.PhotoFileName));
}
