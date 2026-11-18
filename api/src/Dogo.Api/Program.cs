using System.Text.Json.Serialization;
using Dogo.Api.Common;
using Dogo.Api.Features.Auth;
using Dogo.Api.Features.Dogs;
using Dogo.Api.Features.Health;
using Dogo.Api.Features.Photos;
using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Auth;
using Dogo.Api.Infrastructure.Persistence;
using Dogo.Api.Infrastructure.Storage;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options =>
{
    // Web defaults (camelCase) + enums as strings + numbers as JSON numbers only.
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict;
});
builder.Services.AddDogoProblemDetails();
builder.Services.AddValidation();
builder.Services.AddDogoOpenApi();
builder.Services.AddSingleton(TimeProvider.System);

builder.Services.AddDogoPersistence();
builder.Services.AddDogoAuth();
builder.Services.AddOptions<LocalStorageOptions>().BindConfiguration(LocalStorageOptions.SectionName);
builder.Services.AddSingleton<IPhotoStorage, LocalPhotoStorage>();

// Feature services.
builder.Services.AddScoped<SessionService>();

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<SuspendedAccountMiddleware>();

if (app.Environment.IsDevelopment())
{
    // Live document at /openapi/v1.json; the committed api/openapi.json is generated at build time.
    app.MapOpenApi().AllowAnonymous();
}

var api = app.MapGroup("/api/v1");
api.MapHealthEndpoints();
api.MapAuthEndpoints();

// Everything else requires a valid access token (fallback authorization policy).
var authenticated = api.MapGroup("").ProducesProblem(StatusCodes.Status401Unauthorized);
authenticated.MapUserEndpoints();
authenticated.MapDogEndpoints();
authenticated.MapPhotoEndpoints();

app.MapPhotoFiles();

if (app.Environment.IsDevelopment() && !BuildContext.IsOpenApiGeneration)
{
    await app.MigrateDatabaseAsync();
}

await app.RunAsync();
