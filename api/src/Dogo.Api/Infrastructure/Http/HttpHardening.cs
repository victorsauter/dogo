using System.Net;
using Dogo.Api.Common;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Options;

namespace Dogo.Api.Infrastructure.Http;

/// <summary>Reverse proxy in front of the API (<c>Proxy</c> section, ADR 0031).</summary>
public sealed class ProxyOptions
{
    public const string SectionName = "Proxy";

    /// <summary>
    /// Reads <c>X-Forwarded-For</c> and <c>X-Forwarded-Proto</c>, only from the trusted proxies below
    /// (and loopback). Off by default: without a proxy, a client could forge its address.
    /// </summary>
    public bool Enabled { get; set; }

    /// <summary>IP addresses of trusted proxies, e.g. <c>10.0.0.2</c>.</summary>
    public string[] KnownProxies { get; set; } = [];

    /// <summary>Trusted networks in CIDR notation, e.g. <c>10.0.0.0/8</c>.</summary>
    public string[] KnownNetworks { get; set; } = [];

    /// <summary>Number of proxies between the client and the API, rightmost entries first.</summary>
    public int ForwardLimit { get; set; } = 1;
}

public static class HttpHardening
{
    /// <summary>
    /// Default limit of request bodies: generous for JSON (the largest request, a report, is a few KB).
    /// Endpoints that declare their own limit (photo uploads) keep it.
    /// </summary>
    public const long MaxRequestBodyBytes = 256 * 1024;

    public static IServiceCollection AddDogoHttpHardening(this IServiceCollection services)
    {
        services.AddOptions<ProxyOptions>().BindConfiguration(ProxyOptions.SectionName).ValidateOnStart();
        services.AddSingleton<IValidateOptions<ProxyOptions>, ProxyOptionsValidator>();
        services.AddOptions<ForwardedHeadersOptions>().Configure<IOptions<ProxyOptions>>((forwarded, proxy) =>
        {
            var settings = proxy.Value;
            if (!settings.Enabled)
            {
                forwarded.ForwardedHeaders = ForwardedHeaders.None;
                return;
            }

            // Only X-Forwarded-For and -Proto: the host stays checked by AllowedHosts.
            forwarded.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            forwarded.ForwardLimit = settings.ForwardLimit;
            foreach (var address in settings.KnownProxies)
            {
                forwarded.KnownProxies.Add(IPAddress.Parse(address));
            }

            foreach (var network in settings.KnownNetworks)
            {
                forwarded.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(network));
            }
        });

        services.AddHsts(options =>
        {
            options.MaxAge = TimeSpan.FromDays(365);
            options.IncludeSubDomains = false;
            options.Preload = false;
        });

        // Kestrel's default is 30 MB; endpoints with IRequestSizeLimitMetadata (photos) raise it.
        services.Configure<Microsoft.AspNetCore.Server.Kestrel.Core.KestrelServerOptions>(
            kestrel => kestrel.Limits.MaxRequestBodySize = MaxRequestBodyBytes);
        return services;
    }

    /// <summary>Forwarded headers first (client address), then HSTS (outside Development) and the response headers.</summary>
    public static WebApplication UseDogoHttpHardening(this WebApplication app)
    {
        app.UseForwardedHeaders();
        if (!app.Environment.IsDevelopment())
        {
            app.UseHsts();
        }

        app.Use((context, next) =>
        {
            // Set when the response starts: the exception handler clears headers set earlier.
            context.Response.OnStarting(static state =>
            {
                ((HttpResponse)state).Headers.XContentTypeOptions = "nosniff";
                return Task.CompletedTask;
            }, context.Response);
            return next(context);
        });
        return app;
    }

    /// <summary>
    /// Applies <see cref="MaxRequestBodyBytes"/> to endpoints without their own limit. Runs after
    /// routing (endpoint metadata). Kestrel has the same default and also cuts chunked bodies off
    /// while reading; a declared <c>Content-Length</c> over the limit is refused at once, on any
    /// server (the test server has no body size feature). Answered 413 <c>request.too_large</c>.
    /// </summary>
    public static WebApplication UseDogoRequestBodyLimit(this WebApplication app)
    {
        app.Use((context, next) =>
        {
            if (context.GetEndpoint()?.Metadata.GetMetadata<IRequestSizeLimitMetadata>() is not null)
            {
                return next(context);
            }

            if (context.Request.ContentLength > MaxRequestBodyBytes)
            {
                throw new BadHttpRequestException("The request body is too large.", StatusCodes.Status413PayloadTooLarge);
            }

            if (context.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } feature)
            {
                feature.MaxRequestBodySize = MaxRequestBodyBytes;
            }

            return next(context);
        });
        return app;
    }

    private sealed class ProxyOptionsValidator : IValidateOptions<ProxyOptions>
    {
        public ValidateOptionsResult Validate(string? name, ProxyOptions options)
        {
            var failures = new List<string>();
            failures.AddRange(options.KnownProxies.Where(p => !IPAddress.TryParse(p, out _))
                .Select(p => $"Proxy:KnownProxies: '{p}' is not an IP address."));
            failures.AddRange(options.KnownNetworks.Where(n => !System.Net.IPNetwork.TryParse(n, out _))
                .Select(n => $"Proxy:KnownNetworks: '{n}' is not a network in CIDR notation."));
            if (options.ForwardLimit < 1)
            {
                failures.Add("Proxy:ForwardLimit must be at least 1.");
            }

            return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
        }
    }
}
