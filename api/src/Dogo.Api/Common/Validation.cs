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

/// <summary>Rejects a <see cref="DateTimeOffset"/> that is not strictly in the future. Null is valid.</summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class InFutureAttribute : ValidationAttribute
{
    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
    {
        if (value is not DateTimeOffset date)
        {
            return ValidationResult.Success;
        }

        var time = validationContext.GetService(typeof(TimeProvider)) as TimeProvider ?? TimeProvider.System;
        return date > time.GetUtcNow()
            ? ValidationResult.Success
            : new ValidationResult("The date must be in the future.", MemberNames(validationContext));
    }

    private static string[] MemberNames(ValidationContext context) =>
        context.MemberName is null ? [] : [context.MemberName];
}

/// <summary>
/// Rejects a <see cref="DateTimeOffset"/> more than <paramref name="years"/> years ahead. Null is valid.
/// Not in the specification: a guard against typos (2062 for 2026) and far-future walks.
/// </summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class WithinYearsAttribute(int years) : ValidationAttribute
{
    public int Years { get; } = years;

    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
    {
        if (value is not DateTimeOffset date)
        {
            return ValidationResult.Success;
        }

        var time = validationContext.GetService(typeof(TimeProvider)) as TimeProvider ?? TimeProvider.System;
        return date <= time.GetUtcNow().AddYears(Years)
            ? ValidationResult.Success
            : new ValidationResult(
                $"The date cannot be more than {Years} year(s) ahead.",
                validationContext.MemberName is null ? [] : [validationContext.MemberName]);
    }
}

/// <summary>Rejects a collection containing the same item twice. Null is valid.</summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class DistinctItemsAttribute : ValidationAttribute
{
    public DistinctItemsAttribute()
        : base("The list cannot contain duplicates.")
    {
    }

    public override bool IsValid(object? value)
    {
        if (value is not System.Collections.IEnumerable items || value is string)
        {
            return true;
        }

        var seen = new HashSet<object?>();
        foreach (var item in items)
        {
            if (!seen.Add(item))
            {
                return false;
            }
        }

        return true;
    }
}

/// <summary>
/// Requires a string whose length, once leading and trailing white space is removed, is
/// between <paramref name="minimumLength"/> and <paramref name="maximumLength"/>. Null is valid
/// (use [Required] to forbid it).
/// </summary>
[AttributeUsage(AttributeTargets.Property | AttributeTargets.Parameter)]
public sealed class TrimmedLengthAttribute(int minimumLength, int maximumLength) : ValidationAttribute
{
    public int MinimumLength { get; } = minimumLength;

    public int MaximumLength { get; } = maximumLength;

    protected override ValidationResult? IsValid(object? value, ValidationContext validationContext)
    {
        if (value is not string text)
        {
            return ValidationResult.Success;
        }

        var length = text.Trim().Length;
        return length >= MinimumLength && length <= MaximumLength
            ? ValidationResult.Success
            : new ValidationResult(
                $"The field must contain between {MinimumLength} and {MaximumLength} characters, not counting leading and trailing spaces.",
                validationContext.MemberName is null ? [] : [validationContext.MemberName]);
    }
}
