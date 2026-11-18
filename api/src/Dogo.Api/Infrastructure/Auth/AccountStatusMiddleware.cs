using Dogo.Api.Common;
using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Infrastructure.Auth;

/// <summary>
/// Checks the account behind every authenticated request, from the database, so that changes take
/// effect at once rather than when the 15-minute access token expires:
/// <list type="bullet">
/// <item>an account that no longer exists (deleted, spec §4.8) gets 401 <c>auth.invalid_token</c>
/// on every endpoint;</item>
/// <item>every write (any method other than GET, HEAD, OPTIONS) of a suspended account gets 403
/// <c>account.suspended</c> (spec §1); reads stay possible.</item>
/// </list>
/// Applies to every endpoint not marked anonymous, so new features get it for free.
/// </summary>
public sealed class AccountStatusMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, DogoDbContext db)
    {
        if (context.GetEndpoint()?.Metadata.GetMetadata<IAllowAnonymous>() is null
            && context.User.TryGetUserId() is { } userId)
        {
            var status = await db.Users.Where(u => u.Id == userId).Select(u => (UserStatus?)u.Status).SingleOrDefaultAsync(context.RequestAborted);
            if (status is null)
            {
                await Problems.Unauthorized(ErrorCodes.InvalidToken, "The account no longer exists.").ExecuteAsync(context);
                return;
            }

            if (status == UserStatus.Suspended && IsWrite(context.Request.Method))
            {
                await Problems.AccountSuspended().ExecuteAsync(context);
                return;
            }
        }

        await next(context);
    }

    private static bool IsWrite(string method) =>
        !HttpMethods.IsGet(method) && !HttpMethods.IsHead(method) && !HttpMethods.IsOptions(method);
}
