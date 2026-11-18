using Dogo.Api.Common;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Dogo.Api.Infrastructure.Auth;

public static class AuthSetup
{
    public static IServiceCollection AddDogoAuth(this IServiceCollection services)
    {
        services.AddOptions<AuthOptions>().BindConfiguration(AuthOptions.SectionName).ValidateOnStart();
        services.AddOptions<JwtOptions>().BindConfiguration(JwtOptions.SectionName).ValidateOnStart();
        services.AddOptions<IdentityProviderOptions>(IdentityProviderOptions.AppleSectionName).BindConfiguration(IdentityProviderOptions.AppleSectionName);
        services.AddOptions<IdentityProviderOptions>(IdentityProviderOptions.GoogleSectionName).BindConfiguration(IdentityProviderOptions.GoogleSectionName);
        services.AddOptions<AdminOptions>().BindConfiguration(AdminOptions.SectionName);
        if (!BuildContext.IsOpenApiGeneration)
        {
            services.AddSingleton<IValidateOptions<AuthOptions>, AuthOptionsValidator>();
            services.AddSingleton<IValidateOptions<JwtOptions>, AuthOptionsValidator>();
        }

        services.AddHttpClient(nameof(JwksIdentityTokenValidator), client => client.Timeout = TimeSpan.FromSeconds(10));
        services.AddSingleton<IIdentityTokenValidator, JwksIdentityTokenValidator>();
        services.AddSingleton<AccessTokenIssuer>();

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
        services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
            .Configure<IOptions<JwtOptions>>((bearer, jwtOptions) =>
            {
                var jwt = jwtOptions.Value;
                bearer.MapInboundClaims = false;
                bearer.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidIssuer = jwt.Issuer,
                    ValidAudience = jwt.Audience,
                    IssuerSigningKey = AccessTokenIssuer.CreateSigningKey(jwt),
                    ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
                    NameClaimType = "sub",
                    ClockSkew = TimeSpan.FromSeconds(30),
                };
            });

        // Spec §1: everything requires authentication except endpoints marked AllowAnonymous.
        services.AddAuthorizationBuilder()
            .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

        return services;
    }
}
