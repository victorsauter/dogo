namespace Dogo.Api.Common;

/// <summary>
/// Stable values of the <c>code</c> extension carried by every problem details response.
/// Clients branch on these codes, never on titles. Feature-specific codes are named
/// <c>{feature}.{reason}</c>.
/// </summary>
public static class ErrorCodes
{
    // Generic codes, also used as defaults by ProblemDetailsSetup.
    public const string ValidationFailed = "validation.failed";
    public const string InvalidRequest = "request.invalid";
    public const string RequestTooLarge = "request.too_large";
    public const string UnsupportedMediaType = "request.unsupported_media_type";
    public const string NotFound = "not_found";
    public const string MethodNotAllowed = "method_not_allowed";
    public const string Unauthenticated = "auth.unauthenticated";
    public const string Forbidden = "auth.forbidden";
    public const string ServerError = "server.error";
    public const string Error = "error";

    // Authentication and accounts.
    public const string InvalidToken = "auth.invalid_token";
    public const string AccountSuspended = "account.suspended";

    // Health.
    public const string DatabaseUnavailable = "health.database_unavailable";

    // Users and dogs.
    public const string UserNotFound = "user.not_found";
    public const string DogNotFound = "dog.not_found";
    public const string DogForbidden = "dog.forbidden";

    // Photos.
    public const string PhotoMissing = "photo.missing";
    public const string PhotoTooLarge = "photo.too_large";
    public const string PhotoUnsupportedType = "photo.unsupported_type";
    public const string PhotoNotFound = "photo.not_found";
}
