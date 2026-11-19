using System.Globalization;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;

namespace Dogo.Api.Common;

/// <summary>
/// Reads an ISO 8601 date and time that states its offset (<c>Z</c> or <c>±hh:mm</c>), as spec §1
/// requires. A value without offset would otherwise be read in the server's time zone; it is
/// refused instead (400 <c>validation.failed</c> on the field).
/// </summary>
public sealed class ExplicitOffsetDateTimeOffsetConverter : JsonConverter<DateTimeOffset>
{
    public override DateTimeOffset Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.String)
        {
            throw new JsonException("Expected an ISO 8601 date and time string.");
        }

        var text = reader.GetString()!;
        if (!HasExplicitOffset(text) || !reader.TryGetDateTimeOffset(out var value))
        {
            throw new JsonException("Expected an ISO 8601 date and time with an explicit offset, e.g. 2030-05-01T09:00:00Z.");
        }

        return value;
    }

    public override void Write(Utf8JsonWriter writer, DateTimeOffset value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value);

    /// <summary>The time part ends with <c>Z</c> or a <c>±hh:mm</c> (or <c>±hhmm</c>) offset.</summary>
    internal static bool HasExplicitOffset(string text)
    {
        var timeStart = text.IndexOfAny(['T', 't']);
        if (timeStart < 0)
        {
            return false;
        }

        var time = text.AsSpan(timeStart + 1);
        return time.EndsWith("Z", StringComparison.OrdinalIgnoreCase)
            || time.LastIndexOfAny('+', '-') is var sign and >= 0
                && TimeSpan.TryParseExact(time[(sign + 1)..], ["hh\\:mm", "hhmm"], CultureInfo.InvariantCulture, out _);
    }
}

/// <summary>
/// Query parameters of an enum type accept only the names of its members. The default binding
/// (<see cref="Enum.TryParse{TEnum}(string, out TEnum)"/>) also takes numbers (<c>size=7</c>) and
/// comma-separated names, which would reach the database as undefined values. Other unreadable
/// values (wrong case, empty) already fail the binding with 400 <c>request.invalid</c>.
/// </summary>
public static class EnumQueryValidation
{
    /// <summary>Adds the check to every endpoint of <paramref name="builder"/> that has enum query parameters.</summary>
    public static TBuilder RequireDefinedEnumQueryValues<TBuilder>(this TBuilder builder)
        where TBuilder : IEndpointConventionBuilder =>
        builder.AddEndpointFilterFactory(CreateFilter);

    private static EndpointFilterDelegate CreateFilter(EndpointFilterFactoryContext context, EndpointFilterDelegate next)
    {
        var parameters = context.MethodInfo.GetParameters()
            .Select(p => (Parameter: p, Type: Nullable.GetUnderlyingType(p.ParameterType) ?? p.ParameterType))
            .Where(p => p.Type.IsEnum
                && p.Parameter.GetCustomAttribute<FromBodyAttribute>() is null
                && p.Parameter.GetCustomAttribute<FromRouteAttribute>() is null
                && p.Parameter.GetCustomAttribute<FromServicesAttribute>() is null)
            .Select(p => (Name: p.Parameter.GetCustomAttribute<FromQueryAttribute>()?.Name ?? p.Parameter.Name!, Names: Enum.GetNames(p.Type)))
            .ToArray();
        if (parameters.Length == 0)
        {
            return next;
        }

        return async invocation =>
        {
            var query = invocation.HttpContext.Request.Query;
            var errors = new Dictionary<string, string[]>();
            foreach (var (name, names) in parameters)
            {
                if (query.TryGetValue(name, out var values)
                    && values.Any(v => !names.Contains(v, StringComparer.Ordinal)))
                {
                    errors[JsonNamingPolicy.CamelCase.ConvertName(name)] = [$"The value must be one of: {string.Join(", ", names)}."];
                }
            }

            return errors.Count > 0 ? Problems.Validation(errors) : await next(invocation);
        };
    }
}

/// <summary>
/// Query parameters of type <see cref="DateTimeOffset"/> follow the same rule as dates in bodies
/// (<see cref="ExplicitOffsetDateTimeOffsetConverter"/>): without an explicit offset the default binding would
/// read the value in the server's time zone, so it is refused (400 <c>validation.failed</c> on the parameter).
/// A value that is not a date at all already fails the binding with 400 <c>request.invalid</c>.
/// </summary>
public static class ExplicitOffsetQueryValidation
{
    /// <summary>Adds the check to every endpoint of <paramref name="builder"/> that has date query parameters.</summary>
    public static TBuilder RequireExplicitOffsetDateQueryValues<TBuilder>(this TBuilder builder)
        where TBuilder : IEndpointConventionBuilder =>
        builder.AddEndpointFilterFactory(CreateFilter);

    private static EndpointFilterDelegate CreateFilter(EndpointFilterFactoryContext context, EndpointFilterDelegate next)
    {
        var names = context.MethodInfo.GetParameters()
            .Where(p => (Nullable.GetUnderlyingType(p.ParameterType) ?? p.ParameterType) == typeof(DateTimeOffset)
                && p.GetCustomAttribute<FromBodyAttribute>() is null
                && p.GetCustomAttribute<FromRouteAttribute>() is null
                && p.GetCustomAttribute<FromServicesAttribute>() is null)
            .Select(p => p.GetCustomAttribute<FromQueryAttribute>()?.Name ?? p.Name!)
            .ToArray();
        if (names.Length == 0)
        {
            return next;
        }

        return async invocation =>
        {
            var query = invocation.HttpContext.Request.Query;
            var errors = new Dictionary<string, string[]>();
            foreach (var name in names)
            {
                if (query.TryGetValue(name, out var values)
                    && values.Any(v => !string.IsNullOrEmpty(v) && !ExplicitOffsetDateTimeOffsetConverter.HasExplicitOffset(v)))
                {
                    errors[JsonNamingPolicy.CamelCase.ConvertName(name)] =
                        ["The value must be an ISO 8601 date and time with an explicit offset (Z or ±hh:mm), e.g. 2030-05-01T09:00:00Z."];
                }
            }

            return errors.Count > 0 ? Problems.Validation(errors) : await next(invocation);
        };
    }
}
