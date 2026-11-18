using Dogo.Api.Common;
using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Auth;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Features.Auth;

public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/auth")
            .WithTags("Auth")
            .AllowAnonymous()
            .ProducesValidationProblem();

        group.MapPost("/apple", SignInWithApple)
            .WithName("signInWithApple")
            .WithSummary("Exchange an Apple identity token for a session; creates the account on first sign-in.")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        group.MapPost("/google", SignInWithGoogle)
            .WithName("signInWithGoogle")
            .WithSummary("Exchange a Google ID token for a session; creates the account on first sign-in.")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        group.MapPost("/dev", SignInDev)
            .WithName("signInDev")
            .WithSummary("Session for a test account. Only available when Auth:AllowDevLogin is true (404 otherwise).")
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPost("/refresh", Refresh)
            .WithName("refreshSession")
            .WithSummary("Rotate the refresh token and get a new access token.")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        group.MapPost("/logout", Logout)
            .WithName("logout")
            .WithSummary("Revoke a refresh token.");

        return routes;
    }

    private static async Task<Results<Ok<SessionResponse>, ProblemHttpResult>> SignInWithApple(
        AppleSignInRequest request, IIdentityTokenValidator validator, SessionService sessions, CancellationToken cancellationToken)
    {
        var identity = await validator.ValidateAsync(IdentityProvider.Apple, request.IdentityToken, cancellationToken);
        return identity is null
            ? InvalidIdentityToken()
            : await sessions.SignInAsync(IdentityProvider.Apple, identity.Subject, identity.Email, request.DisplayName ?? identity.Name, cancellationToken);
    }

    private static async Task<Results<Ok<SessionResponse>, ProblemHttpResult>> SignInWithGoogle(
        GoogleSignInRequest request, IIdentityTokenValidator validator, SessionService sessions, CancellationToken cancellationToken)
    {
        var identity = await validator.ValidateAsync(IdentityProvider.Google, request.IdToken, cancellationToken);
        return identity is null
            ? InvalidIdentityToken()
            : await sessions.SignInAsync(IdentityProvider.Google, identity.Subject, identity.Email, identity.Name, cancellationToken);
    }

    private static async Task<Results<Ok<SessionResponse>, ProblemHttpResult>> SignInDev(
        DevSignInRequest request, IOptions<AuthOptions> options, SessionService sessions, CancellationToken cancellationToken)
    {
        // Mapped unconditionally so that it appears in openapi.json; answers 404 when disabled.
        if (!options.Value.AllowDevLogin)
        {
            return Problems.NotFound(ErrorCodes.NotFound, "Not Found");
        }

        return await sessions.SignInAsync(IdentityProvider.Dev, request.Subject.Trim(), request.Email?.Trim(), request.DisplayName, cancellationToken);
    }

    private static Task<Results<Ok<SessionResponse>, ProblemHttpResult>> Refresh(
        RefreshTokenRequest request, SessionService sessions, CancellationToken cancellationToken) =>
        sessions.RefreshAsync(request.RefreshToken, cancellationToken);

    private static async Task<NoContent> Logout(
        RefreshTokenRequest request, SessionService sessions, CancellationToken cancellationToken)
    {
        await sessions.RevokeAsync(request.RefreshToken, cancellationToken);
        return TypedResults.NoContent();
    }

    private static ProblemHttpResult InvalidIdentityToken() =>
        Problems.Unauthorized(ErrorCodes.InvalidToken, "The identity token is invalid or expired.");
}
