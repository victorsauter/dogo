using System.ComponentModel.DataAnnotations;
using Dogo.Api.Common;
using Dogo.Api.Features.Users;

namespace Dogo.Api.Features.Messages;

public sealed record CreateMessageRequest
{
    /// <summary>1 to 1000 characters once leading and trailing white space is removed.</summary>
    [Required]
    [TrimmedLength(1, Message.TextMaxLength)]
    public required string Text { get; init; }
}

/// <summary>A message of a walk's thread. <c>author</c> is null when the account no longer exists.</summary>
public sealed record MessageResponse(Guid Id, string Text, DateTimeOffset CreatedAt, UserSummaryResponse? Author, bool IsMine)
{
    /// <summary>Requires <see cref="Message.Author"/> to be loaded.</summary>
    internal static MessageResponse From(Message message, Guid viewerId) => new(
        message.Id,
        message.Text,
        message.CreatedAt,
        message.Author is null ? null : UserSummaryResponse.From(message.Author),
        message.AuthorId == viewerId);
}

/// <summary>
/// A page of a walk's thread, oldest first. <c>hasMore</c> is true when older messages exist:
/// pass the id of the first item as <c>before</c> to load them.
/// </summary>
public sealed record MessagePageResponse(IReadOnlyList<MessageResponse> Items, bool HasMore);
