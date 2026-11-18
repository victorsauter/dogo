using System.Net;
using System.Net.Http.Json;
using Dogo.Api.Features.DemoData;
using Dogo.Api.Tests.Infrastructure;
using Dogo.Api.Tests.Organizations;

namespace Dogo.Api.Tests.DemoData;

/// <summary>Helpers shared by the demo data tests.</summary>
public abstract class DemoDataTestBase(ApiFixture fixture) : OrganizationTestBase(fixture)
{
    protected const string Url = "/api/v1/dev/demo-data";

    /// <summary>Seppois-le-Haut, centre of the demo community.</summary>
    protected const double SeppoisLatitude = 47.5339;
    protected const double SeppoisLongitude = 7.1844;

    /// <summary>Number of demo dogs, from the tables (owners and educators).</summary>
    protected static int TableDogCount => DemoPeople.Owners.Concat(DemoPeople.Educators).Sum(p => p.Dogs.Count);

    protected async Task<DemoDataGenerationResponse> GenerateAsync(bool photos = false)
    {
        var response = await CreateClient().PostAsJsonAsync(Url, new { photos }, Ct);
        Assert.True(response.StatusCode == HttpStatusCode.OK, await response.Content.ReadAsStringAsync(Ct));
        return (await response.Content.ReadFromJsonAsync<DemoDataGenerationResponse>(Json, Ct))!;
    }

    protected async Task<DemoDataStatusResponse> StatusAsync() =>
        (await CreateClient().GetFromJsonAsync<DemoDataStatusResponse>(Url, Json, Ct))!;

    protected async Task RemoveAsync()
    {
        var response = await CreateClient().DeleteAsync(Url, Ct);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    /// <summary>Signs in a demo account through the dev sign-in, as the app does.</summary>
    protected async Task<HttpClient> SignInAsDemoAsync(string subject)
    {
        var (client, _) = await SignedInAsync(subject, "ignored for an existing account");
        return client;
    }

    /// <summary>Files currently stored by the photo storage of the test host.</summary>
    protected string[] StoredPhotoFiles() =>
        Directory.Exists(Factory.PhotoPath) ? Directory.GetFiles(Factory.PhotoPath) : [];
}
