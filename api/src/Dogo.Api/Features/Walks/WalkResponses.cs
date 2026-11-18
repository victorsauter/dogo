using Dogo.Api.Features.Dogs;
using Dogo.Api.Features.Users;

namespace Dogo.Api.Features.Walks;

/// <summary>Organisation carrying a professional walk (filled from Lot 4).</summary>
public sealed record WalkOrganizationResponse(Guid Id, string Name);

/// <summary>A walk in the search results (<c>GET /walks</c>).</summary>
public sealed record WalkSearchResult(
    Guid Id,
    string Title,
    DateTimeOffset StartsAt,
    int DurationMinutes,
    GeoPoint Location,
    string LocationLabel,
    double DistanceMeters,
    int MaxDogs,
    int AcceptedDogsCount,
    IReadOnlyList<DogSize> AllowedSizes,
    LeashRule LeashRule,
    WalkAccess Access,
    WalkStatus Status,
    UserSummaryResponse Organizer,
    bool IsProfessional,
    WalkOrganizationResponse? Organization,
    bool RepeatsWeekly,
    bool HasBlockedParticipant)
{
    internal static WalkSearchResult From(WalkRow row, double distanceMeters, LaterLotFields later) => new(
        row.Walk.Id,
        row.Walk.Title,
        row.Walk.StartsAt,
        row.Walk.DurationMinutes,
        row.Location,
        row.Walk.LocationLabel,
        Math.Round(distanceMeters, 1),
        row.Walk.MaxDogs,
        row.AcceptedDogsCount,
        row.Walk.AllowedSizes,
        row.Walk.LeashRule,
        row.Walk.Access,
        row.Walk.Status,
        UserSummaryResponse.From(row.Organizer),
        later.IsProfessional,
        later.Organization,
        later.RepeatsWeekly,
        later.HasBlockedParticipant);
}

/// <summary>A walk in <c>GET /me/walks</c>, with the signed-in user's registrations on it.</summary>
public sealed record MyWalkResponse(
    Guid Id,
    string Title,
    DateTimeOffset StartsAt,
    int DurationMinutes,
    GeoPoint Location,
    string LocationLabel,
    int MaxDogs,
    int AcceptedDogsCount,
    IReadOnlyList<DogSize> AllowedSizes,
    LeashRule LeashRule,
    WalkAccess Access,
    WalkStatus Status,
    UserSummaryResponse Organizer,
    bool IsProfessional,
    WalkOrganizationResponse? Organization,
    bool RepeatsWeekly,
    bool HasBlockedParticipant,
    IReadOnlyList<MyRegistrationResponse> MyRegistrations)
{
    internal static MyWalkResponse From(WalkRow row, LaterLotFields later, IReadOnlyList<MyRegistrationResponse> myRegistrations) => new(
        row.Walk.Id,
        row.Walk.Title,
        row.Walk.StartsAt,
        row.Walk.DurationMinutes,
        row.Location,
        row.Walk.LocationLabel,
        row.Walk.MaxDogs,
        row.AcceptedDogsCount,
        row.Walk.AllowedSizes,
        row.Walk.LeashRule,
        row.Walk.Access,
        row.Walk.Status,
        UserSummaryResponse.From(row.Organizer),
        later.IsProfessional,
        later.Organization,
        later.RepeatsWeekly,
        later.HasBlockedParticipant,
        myRegistrations);
}

/// <summary>Full walk page (<c>GET /walks/{id}</c>), as seen by the signed-in user.</summary>
public sealed record WalkDetailResponse(
    Guid Id,
    string Title,
    string Description,
    DateTimeOffset StartsAt,
    int DurationMinutes,
    GeoPoint Location,
    string LocationLabel,
    int MaxDogs,
    int AcceptedDogsCount,
    IReadOnlyList<DogSize> AllowedSizes,
    LeashRule LeashRule,
    string Rules,
    WalkAccess Access,
    WalkStatus Status,
    UserSummaryResponse Organizer,
    bool IsProfessional,
    WalkOrganizationResponse? Organization,
    bool RepeatsWeekly,
    bool HasBlockedParticipant,
    DateTimeOffset CreatedAt,
    bool IsOrganizer,
    IReadOnlyList<ParticipantResponse> Participants,
    IReadOnlyList<MyRegistrationResponse> MyRegistrations,
    IReadOnlyList<ParticipantResponse> PendingRegistrations)
{
    internal static WalkDetailResponse From(
        WalkRow row,
        LaterLotFields later,
        bool isOrganizer,
        IReadOnlyList<ParticipantResponse> participants,
        IReadOnlyList<MyRegistrationResponse> myRegistrations,
        IReadOnlyList<ParticipantResponse> pendingRegistrations) => new(
        row.Walk.Id,
        row.Walk.Title,
        row.Walk.Description,
        row.Walk.StartsAt,
        row.Walk.DurationMinutes,
        row.Location,
        row.Walk.LocationLabel,
        row.Walk.MaxDogs,
        row.AcceptedDogsCount,
        row.Walk.AllowedSizes,
        row.Walk.LeashRule,
        row.Walk.Rules,
        row.Walk.Access,
        row.Walk.Status,
        UserSummaryResponse.From(row.Organizer),
        later.IsProfessional,
        later.Organization,
        later.RepeatsWeekly,
        later.HasBlockedParticipant,
        row.Walk.CreatedAt,
        isOrganizer,
        participants,
        myRegistrations,
        pendingRegistrations);
}

/// <summary>A registered dog with its owner: accepted participants, or pending requests for the organizer.</summary>
public sealed record ParticipantResponse(Guid RegistrationId, DogResponse Dog, UserSummaryResponse Owner)
{
    /// <summary>Requires <see cref="Registration.Dog"/> and <see cref="Registration.User"/> to be loaded.</summary>
    internal static ParticipantResponse From(Registration registration) =>
        new(registration.Id, DogResponse.From(registration.Dog!), UserSummaryResponse.From(registration.User));
}

/// <summary>One of the signed-in user's registrations on a walk, in any status. <c>dogId</c> is null if the dog was deleted.</summary>
public sealed record MyRegistrationResponse(Guid Id, Guid? DogId, RegistrationStatus Status)
{
    internal static MyRegistrationResponse From(Registration registration) => new(registration.Id, registration.DogId, registration.Status);
}

/// <summary>A registration as returned by the registration endpoints.</summary>
public sealed record RegistrationResponse(Guid Id, Guid WalkId, Guid? DogId, Guid UserId, RegistrationStatus Status, DateTimeOffset CreatedAt)
{
    internal static RegistrationResponse From(Registration registration) => new(
        registration.Id,
        registration.WalkId,
        registration.DogId,
        registration.UserId,
        registration.Status,
        registration.CreatedAt);
}
