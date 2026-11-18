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
                    Title = "dogo API",
                    Version = "v1",
                    Description = "API of the dogo app. Errors are RFC 9457 problem details with a stable `code` extension.",
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
                if (context.JsonTypeInfo.Type.IsEnum)
                {
                    schema.Type = JsonSchemaType.String;
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
}
