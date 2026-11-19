using Dogo.Api.Infrastructure.Persistence;
using Dogo.Api.Infrastructure.Push;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Features.Notifications;

/// <summary>
/// Turns an event into push notifications (spec §4.4): drops the actor and duplicates, keeps
/// the recipients whose preferences accept this type, builds the French texts and sends one
/// notification per device. Devices that the push service reports as unregistered are removed.
/// </summary>
public sealed partial class NotificationService(DogoDbContext db, IPushSender sender, ILogger<NotificationService> logger)
{
    public async Task DeliverAsync(NotificationRequest request, CancellationToken cancellationToken)
    {
        var recipientIds = request.RecipientIds.Distinct().Where(id => id != request.ActorId).ToList();
        if (recipientIds.Count == 0)
        {
            return;
        }

        // No row means the defaults: everything on.
        var category = NotificationTexts.CategoryOf(request.Type);
        var preferences = await db.NotificationPreferences.AsNoTracking()
            .Where(p => recipientIds.Contains(p.UserId))
            .ToDictionaryAsync(p => p.UserId, cancellationToken);
        recipientIds = recipientIds.Where(id => !preferences.TryGetValue(id, out var p) || p.Allows(category)).ToList();
        if (recipientIds.Count == 0)
        {
            return;
        }

        var devices = await db.Devices.AsNoTracking()
            .Where(d => recipientIds.Contains(d.UserId))
            .OrderBy(d => d.UserId).ThenBy(d => d.Id)
            .ToListAsync(cancellationToken);
        if (devices.Count == 0)
        {
            return;
        }

        var actorName = request.ActorId is { } actorId
            ? await db.Users.Where(u => u.Id == actorId).Select(u => u.DisplayName).SingleOrDefaultAsync(cancellationToken)
            : null;
        var text = NotificationTexts.For(request.Type, new NotificationTextContext(request.Subject, actorName ?? NotificationTexts.UnknownActor, request.Detail));
        var data = new Dictionary<string, string>
        {
            ["type"] = request.Type.WireName(),
            [request.Subject.IdKey] = request.Subject.Id.ToString(),
        };
        if (request.Subject.Path is { } path)
        {
            // Without url the app shows the notification and ignores a tap (mobile routing.ts).
            data["url"] = $"{DeepLinkPrefix}{path}";
        }

        var messages = devices.Select(d => new PushMessage(d.UserId, d.ExpoPushToken, text.Title, text.Body, data)).ToList();
        var result = await sender.SendAsync(messages, cancellationToken);
        LogSent(request.Type, request.Subject.Id, messages.Count, recipientIds.Count);

        if (result.UnregisteredTokens.Count > 0)
        {
            var tokens = result.UnregisteredTokens.ToList();
            var removed = await db.Devices.Where(d => tokens.Contains(d.ExpoPushToken)).ExecuteDeleteAsync(cancellationToken);
            LogDevicesRemoved(removed);
        }
    }

    /// <summary>Deep link scheme of the app (ADR 0041); the single place where it is defined.</summary>
    public const string DeepLinkScheme = "uzu";

    /// <summary>Start of every deep link in <c>data.url</c>, e.g. <c>uzu://walks/{id}</c>.</summary>
    public const string DeepLinkPrefix = DeepLinkScheme + "://";

    [LoggerMessage(Level = LogLevel.Debug, Message = "{Type} notification for {SubjectId}: {DeviceCount} devices of {UserCount} users")]
    private partial void LogSent(NotificationType type, Guid subjectId, int deviceCount, int userCount);

    [LoggerMessage(Level = LogLevel.Information, Message = "Removed {Count} devices no longer registered with the push service")]
    private partial void LogDevicesRemoved(int count);
}
