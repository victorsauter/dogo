using Dogo.Api.Common;
using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Infrastructure.Auth;

/// <summary>
/// Spec §1: every write (any method other than GET, HEAD, OPTIONS) by a suspended user
/// returns 403 <c>account.suspended</c>. Applies to every authenticated endpoint, so new
/// features get it for free. The status is read from the database, so a suspension takes
/// effect immediately rather than when the access token expires.
/// </summary>
public sealed class SuspendedAccountMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, DogoDbContext db)
    {
        if (IsWrite(context.Request.Method)
            && context.GetEndpoint()?.Metadata.GetMetadata<IAllowAnonymous>() is null
            && context.User.TryGetUserId() is { } userId)
        {
            var status = await db.Users.Where(u => u.Id == userId).Select(u => (UserStatus?)u.Status).SingleOrDefaultAsync(context.RequestAborted);
            if (status == UserStatus.Suspended)
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
