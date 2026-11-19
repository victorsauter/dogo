using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.OpenApi;

namespace Dogo.Api.Common;

/// <summary>
/// OpenAPI description, written at build time to <c>api/openapi.json</c> and used to
/// generate the mobile TypeScript client (ADR 0007). Endpoints provide operationId
/// (<c>WithName</c>), tag, summary and every response type; this class adds the
/// document-wide parts.
/// </summary>
public static class OpenApiSetup
{
    public const string BearerScheme = "Bearer";

    public static IServiceCollection AddDogoOpenApi(this IServiceCollection services)
    {
        services.AddOpenApi(options =>
        {
            options.AddDocumentTransformer((document, _, _) =>
            {
                document.Info = new OpenApiInfo
                {
                    Title = "Uzu API",
                    Version = "v1",
                    Description = "API of the Uzu app. Errors are RFC 9457 problem details with a stable `code` extension.",
                };
                // The client chooses the server; no build-machine URL in the committed file.
                document.Servers = [];
                document.Components ??= new OpenApiComponents();
                document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
                document.Components.SecuritySchemes[BearerScheme] = new OpenApiSecurityScheme
                {
                    Type = SecuritySchemeType.Http,
                    Scheme = "bearer",
                    BearerFormat = "JWT",
                    Description = "Access token returned by the /auth endpoints.",
                };
                return Task.CompletedTask;
            });

            options.AddOperationTransformer((operation, context, _) =>
            {
                if (!context.Description.ActionDescriptor.EndpointMetadata.OfType<IAllowAnonymous>().Any())
                {
                    operation.Security ??= [];
                    operation.Security.Add(new OpenApiSecurityRequirement
                    {
                        [new OpenApiSecuritySchemeReference(BearerScheme, context.Document)] = [],
                    });
                }

                // Stable, readable order: responses sorted by status code.
                if (operation.Responses is { Count: > 1 } responses)
                {
                    var sorted = responses.OrderBy(r => r.Key, StringComparer.Ordinal).ToList();
                    responses.Clear();
                    foreach (var (status, response) in sorted)
                    {
                        responses[status] = response;
                    }
                }

                return Task.CompletedTask;
            });

            options.AddSchemaTransformer((schema, context, _) =>
            {
                // Enums are serialized as strings (JsonStringEnumConverter): say so explicitly.
                // A nullable enum used only as an optional query parameter would otherwise
                // produce an enum schema containing null and no type.
                var type = context.JsonTypeInfo.Type;
                if (type.IsEnum || (Nullable.GetUnderlyingType(type)?.IsEnum ?? false))
                {
                    schema.Type = JsonSchemaType.String;
                    if (schema.Enum is { } values)
                    {
                        foreach (var value in values.Where(v => v is null || v.GetValueKind() == JsonValueKind.Null).ToList())
                        {
                            values.Remove(value);
                        }
                    }
                }

                // A custom converter hides the type from the schema exporter: still an ISO 8601 string.
                // (On a nullable property the serializer wraps the converter: read the attribute instead.)
                if (context.JsonPropertyInfo?.AttributeProvider?.GetCustomAttributes(typeof(JsonConverterAttribute), true)
                        .OfType<JsonConverterAttribute>()
                        .Any(a => a.ConverterType == typeof(ExplicitOffsetDateTimeOffsetConverter)) == true)
                {
                    schema.Type = Nullable.GetUnderlyingType(context.JsonPropertyInfo.PropertyType) is null
                        ? JsonSchemaType.String
                        : JsonSchemaType.String | JsonSchemaType.Null;
                    schema.Format = "date-time";
                }

                // Every problem carries the stable "code" extension (see ErrorCodes).
                if (typeof(ProblemDetails).IsAssignableFrom(context.JsonTypeInfo.Type))
                {
                    schema.Properties ??= new Dictionary<string, IOpenApiSchema>();
                    schema.Properties["code"] = new OpenApiSchema
                    {
                        Type = JsonSchemaType.String,
                        Description = "Stable error code, e.g. dog.not_found or validation.failed.",
                    };
                    schema.Required ??= new HashSet<string>();
                    schema.Required.Add("code");
                }

                return Task.CompletedTask;
            });
        });
        return services;
    }

    /// <summary>
    /// Marks query parameters as required in the description. Used for parameters bound as
    /// nullable so that a missing value is reported by the handler as <c>validation.failed</c>
    /// naming the field, instead of a generic binding failure.
    /// </summary>
    public static RouteHandlerBuilder WithRequiredQueryParameters(this RouteHandlerBuilder builder, params string[] names) =>
        builder.AddOpenApiOperationTransformer((operation, _, _) =>
        {
            foreach (var parameter in operation.Parameters?.OfType<OpenApiParameter>() ?? [])
            {
                if (parameter.In == ParameterLocation.Query && names.Contains(parameter.Name))
                {
                    parameter.Required = true;
                }
            }

            return Task.CompletedTask;
        });
}
