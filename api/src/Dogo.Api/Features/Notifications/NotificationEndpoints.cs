using System.Security.Claims;
using Dogo.Api.Common;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Features.Notifications;

public static class NotificationEndpoints
{
    public static IEndpointRouteBuilder MapNotificationEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/me").WithTags("Notifications");

        group.MapPut("/devices", RegisterDevice)
            .WithName("registerDevice")
            .WithSummary("Register the signed-in user's device for push notifications. A token registered by another user moves to this one.")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden);

        group.MapDelete("/devices/{token}", DeleteDevice)
            .WithName("deleteDevice")
            .WithSummary("Stop sending push notifications to one of the signed-in user's devices. Idempotent.")
            .ProducesProblem(StatusCodes.Status403Forbidden);

        group.MapGet("/notification-preferences", GetPreferences)
            .WithName("getNotificationPreferences")
            .WithSummary("Get which notifications the signed-in user receives (all by default).");

        group.MapPut("/notification-preferences", UpdatePreferences)
            .WithName("updateNotificationPreferences")
            .WithSummary("Replace which notifications the signed-in user receives.")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status403Forbidden);

        return routes;
    }

    private static async Task<Ok<DeviceResponse>> RegisterDevice(
        RegisterDeviceRequest request, ClaimsPrincipal principal, DogoDbContext db, TimeProvider timeProvider, CancellationToken cancellationToken)
    {
        var userId = principal.GetUserId();
        var token = request.ExpoPushToken.Trim();
        var platform = request.Platform.ToString();
        var now = TruncateToMicroseconds(timeProvider.GetUtcNow());

        // One statement, safe under concurrent registrations of the same token.
        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO devices (id, user_id, expo_push_token, platform, updated_at)
            VALUES ({Guid.CreateVersion7()}, {userId}, {token}, {platform}, {now})
            ON CONFLICT (expo_push_token) DO UPDATE
            SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = EXCLUDED.updated_at
            """,
            cancellationToken);
        return TypedResults.Ok(new DeviceResponse(token, request.Platform, now));
    }

    private static async Task<NoContent> DeleteDevice(
        string token, ClaimsPrincipal principal, DogoDbContext db, CancellationToken cancellationToken)
    {
        // Only the signed-in user's own device; an unknown token is not an error.
        var userId = principal.GetUserId();
        await db.Devices.Where(d => d.ExpoPushToken == token && d.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Ok<NotificationPreferencesResponse>> GetPreferences(
        ClaimsPrincipal principal, DogoDbContext db, CancellationToken cancellationToken)
    {
        var userId = principal.GetUserId();
        var preferences = await db.NotificationPreferences.AsNoTracking().SingleOrDefaultAsync(p => p.UserId == userId, cancellationToken)
            ?? new NotificationPreferences { UserId = userId };
        return TypedResults.Ok(NotificationPreferencesResponse.From(preferences));
    }

    private static async Task<Ok<NotificationPreferencesResponse>> UpdatePreferences(
        UpdateNotificationPreferencesRequest request, ClaimsPrincipal principal, DogoDbContext db, CancellationToken cancellationToken)
    {
        var userId = principal.GetUserId();
        await db.Database.ExecuteSqlAsync(
            $"""
            INSERT INTO notification_preferences (user_id, registrations, walk_changes, messages, reminders)
            VALUES ({userId}, {request.Registrations}, {request.WalkChanges}, {request.Messages}, {request.Reminders})
            ON CONFLICT (user_id) DO UPDATE
            SET registrations = EXCLUDED.registrations, walk_changes = EXCLUDED.walk_changes,
                messages = EXCLUDED.messages, reminders = EXCLUDED.reminders
            """,
            cancellationToken);
        return TypedResults.Ok(new NotificationPreferencesResponse(request.Registrations, request.WalkChanges, request.Messages, request.Reminders));
    }

    /// <summary>PostgreSQL keeps microseconds: the value returned equals the one stored.</summary>
    private static DateTimeOffset TruncateToMicroseconds(DateTimeOffset value) =>
        value.AddTicks(-(value.Ticks % TimeSpan.TicksPerMicrosecond)).ToUniversalTime();
}
