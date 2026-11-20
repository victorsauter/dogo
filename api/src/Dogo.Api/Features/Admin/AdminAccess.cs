using Dogo.Api.Common;
using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Auth;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Features.Admin;

/// <summary>
/// Administrators are the accounts whose e-mail is listed in <c>Admin:Emails</c> (spec §4.7,
/// ADR 0020). The account is read from the database on each check, so changing the list, an
/// account's e-mail or its status takes effect at once. A suspended account is not an
/// administrator, nor a dev sign-in account outside Development, Testing and Demo (ADR 0031, 0043).
/// </summary>
public static class AdminAccess
{
    public static async Task<bool> IsAdminAsync(this DogoDbContext db, AdminOptions options, Guid userId, CancellationToken cancellationToken)
    {
        if (options.Emails.Length == 0)
        {
            return false;
        }

        var account = await db.Users.Where(u => u.Id == userId)
            .Select(u => new { u.Provider, u.Status, u.Email })
            .SingleOrDefaultAsync(cancellationToken);
        return account is not null && options.IsAdmin(account.Provider, account.Status, account.Email);
    }

    /// <summary>Every administrator account, by the same rule as <see cref="IsAdminAsync"/>.</summary>
    public static async Task<List<Guid>> AdminIdsAsync(this DogoDbContext db, AdminOptions options, CancellationToken cancellationToken)
    {
        if (options.Emails.Length == 0)
        {
            return [];
        }

        // Narrowed in the database, decided by the complete rule in memory.
        var emails = options.Emails.Select(e => e.ToLowerInvariant()).ToList();
        var candidates = await db.Users
            .Where(u => u.Status == UserStatus.Active && u.Email != null && emails.Contains(u.Email.ToLower()))
            .Select(u => new { u.Id, u.Provider, u.Status, u.Email })
            .ToListAsync(cancellationToken);
        return candidates.Where(u => options.IsAdmin(u.Provider, u.Status, u.Email)).Select(u => u.Id).ToList();
    }

    /// <summary>Answers 403 <c>admin.forbidden</c> to anyone but an administrator, before the handler runs.</summary>
    public static TBuilder RequireAdmin<TBuilder>(this TBuilder builder)
        where TBuilder : IEndpointConventionBuilder =>
        builder.AddEndpointFilter(async (context, next) =>
        {
            var http = context.HttpContext;
            var db = http.RequestServices.GetRequiredService<DogoDbContext>();
            var options = http.RequestServices.GetRequiredService<IOptions<AdminOptions>>().Value;
            return http.User.TryGetUserId() is { } userId && await db.IsAdminAsync(options, userId, http.RequestAborted)
                ? await next(context)
                : Problems.Forbidden(ErrorCodes.AdminForbidden, "Only administrators can use this endpoint.");
        });
}
