namespace Dogo.Api.Features.DemoData;

public sealed record GenerateDemoDataRequest
{
    /// <summary>Downloads photos for half of the people and dogs (true by default). Never makes the generation fail.</summary>
    public bool Photos { get; init; } = true;
}

public enum DemoAccountKind
{
    Owner,
    Educator,
}

/// <summary>A demo account to sign in as, through <c>POST /auth/dev</c> with its <see cref="Subject"/>.</summary>
/// <param name="Kind"><c>Educator</c> for the owner or an educator of an organisation, <c>Owner</c> otherwise.</param>
/// <param name="OrganizationName">The organisation an educator runs or works for; null for owners.</param>
public sealed record DemoAccountResponse(
    string Subject,
    string DisplayName,
    string? PhotoUrl,
    DemoAccountKind Kind,
    IReadOnlyList<string> DogNames,
    string? OrganizationName);

/// <summary>What the demo accounts own: walks they organise, registrations and messages they wrote…</summary>
public sealed record DemoDataCounts(
    int Owners,
    int Educators,
    int Dogs,
    int Organizations,
    int Walks,
    int UpcomingWalks,
    int PastWalks,
    int Registrations,
    int Messages,
    int Blocks,
    int Reports,
    int Photos);

public sealed record DemoDataStatusResponse(bool Exists, DemoDataCounts Counts, IReadOnlyList<DemoAccountResponse> Accounts);

/// <param name="PhotosStored">Photos downloaded and stored by this generation.</param>
/// <param name="PhotosFailed">Photos skipped (network error, timeout, invalid image); the generation succeeds anyway.</param>
public sealed record DemoDataGenerationResponse(DemoDataCounts Counts, bool PhotosRequested, int PhotosStored, int PhotosFailed);
