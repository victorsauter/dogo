using System.Text.Json.Serialization;
using Dogo.Api.Common;
using Dogo.Api.Features.Admin;
using Dogo.Api.Features.Auth;
using Dogo.Api.Features.DemoData;
using Dogo.Api.Features.Blocks;
using Dogo.Api.Features.Dogs;
using Dogo.Api.Features.Health;
using Dogo.Api.Features.Messages;
using Dogo.Api.Features.Notifications;
using Dogo.Api.Features.Organizations;
using Dogo.Api.Features.Photos;
using Dogo.Api.Features.Reports;
using Dogo.Api.Features.Users;
using Dogo.Api.Features.Walks;
using Dogo.Api.Infrastructure.Auth;
using Dogo.Api.Infrastructure.Jobs;
using Dogo.Api.Infrastructure.Persistence;
using Dogo.Api.Infrastructure.Push;
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

builder.Services.AddDogoPush();

// Feature services.
builder.Services.AddScoped<SessionService>();
builder.Services.AddScoped<AccountDeletion>();

// Demo data, development only (DemoData:Enabled, refused in Production, ADR 0027).
builder.Services.AddDogoDemoData();

// Reports tell the administration through an interface; V1 only logs (spec §4.7, §7).
builder.Services.AddSingleton<IReportNotifier, LoggingReportNotifier>();

// Notifications: in-process queue read by a background dispatcher (ADR 0019).
builder.Services.AddSingleton<NotificationQueue>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddHostedService<NotificationDispatcher>();

// Scheduled jobs: plain services run by a periodic loop (BackgroundJobs:Enabled, BackgroundJobs:Interval).
builder.Services.AddScoped<WalkReminderJob>();
builder.Services.AddScoped<WalkSeriesJob>();
builder.Services.AddOptions<BackgroundJobsOptions>().BindConfiguration(BackgroundJobsOptions.SectionName);
builder.Services.AddHostedService<BackgroundJobsService>();

var app = builder.Build();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<AccountStatusMiddleware>();

if (app.Environment.IsDevelopment())
{
    // Live document at /openapi/v1.json; the committed api/openapi.json is generated at build time.
    app.MapOpenApi().AllowAnonymous();
}

var api = app.MapGroup("/api/v1");
api.MapHealthEndpoints();
api.MapAuthEndpoints();
api.MapDemoDataEndpoints();

// Everything else requires a valid access token (fallback authorization policy).
var authenticated = api.MapGroup("").ProducesProblem(StatusCodes.Status401Unauthorized);
authenticated.MapUserEndpoints();
authenticated.MapDogEndpoints();
authenticated.MapPhotoEndpoints();
authenticated.MapWalkEndpoints();
authenticated.MapRegistrationEndpoints();
authenticated.MapMessageEndpoints();
authenticated.MapNotificationEndpoints();
authenticated.MapOrganizationEndpoints();
authenticated.MapMembershipEndpoints();
authenticated.MapBlockEndpoints();
authenticated.MapReportEndpoints();
authenticated.MapAdminEndpoints();

app.MapPhotoFiles();

if (app.Environment.IsDevelopment() && !BuildContext.IsOpenApiGeneration)
{
    await app.MigrateDatabaseAsync();
}

await app.RunAsync();
