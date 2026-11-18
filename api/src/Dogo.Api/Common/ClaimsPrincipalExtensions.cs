using System.Security.Claims;

namespace Dogo.Api.Common;

public static class ClaimsPrincipalExtensions
{
    /// <summary>
    /// Id of the authenticated user (JWT <c>sub</c> claim). Only call it on endpoints that
    /// require authentication, where the claim is guaranteed by the bearer scheme.
    /// </summary>
    public static Guid GetUserId(this ClaimsPrincipal principal) =>
        TryGetUserId(principal) ?? throw new InvalidOperationException("The principal has no valid user id claim.");

    public static Guid? TryGetUserId(this ClaimsPrincipal principal) =>
        Guid.TryParse(principal.FindFirstValue("sub"), out var id) ? id : null;
}
