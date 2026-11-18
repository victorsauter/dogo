using System.ComponentModel.DataAnnotations;
using Dogo.Api.Common;

namespace Dogo.Api.Features.Users;

/// <summary>Partial update of the profile: an omitted or null property is left unchanged.</summary>
public sealed record UpdateMeRequest
{
    [NotBlank]
    [StringLength(User.DisplayNameMaxLength, MinimumLength = 1)]
    public string? DisplayName { get; init; }

    /// <summary>Send an empty string to clear the bio.</summary>
    [StringLength(User.BioMaxLength)]
    public string? Bio { get; init; }
}
