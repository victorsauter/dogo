using System.ComponentModel.DataAnnotations;

namespace Dogo.Api.Common;

/// <summary>Rejects a <see cref="DateOnly"/> later than today (UTC). Null is valid.</summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class NotInFutureAttribute : ValidationAttribute
{
    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
    {
        if (value is not DateOnly date)
        {
            return ValidationResult.Success;
        }

        var time = validationContext.GetService(typeof(TimeProvider)) as TimeProvider ?? TimeProvider.System;
        var today = DateOnly.FromDateTime(time.GetUtcNow().UtcDateTime);
        return date <= today
            ? ValidationResult.Success
            : new ValidationResult("The date cannot be in the future.", MemberNames(validationContext));
    }

    private static string[] MemberNames(ValidationContext context) =>
        context.MemberName is null ? [] : [context.MemberName];
}

/// <summary>Rejects a string made only of white space. Null is valid (use [Required] to forbid it).</summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class NotBlankAttribute : ValidationAttribute
{
    public NotBlankAttribute()
        : base("The field cannot be blank.")
    {
    }

    public override bool IsValid(object? value) => value is not string text || !string.IsNullOrWhiteSpace(text);
}
