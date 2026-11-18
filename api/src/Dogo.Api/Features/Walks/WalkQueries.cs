using Dogo.Api.Features.Users;
using Dogo.Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Dogo.Api.Features.Walks;

/// <summary>A walk with what every walk response shows next to it.</summary>
internal sealed record WalkRow(Walk Walk, User Organizer, int AcceptedDogsCount)
{
    public GeoPoint Location => new() { Latitude = Walk.Location.Y, Longitude = Walk.Location.X };
}

/// <summary>
/// Walk response fields whose data arrives with later lots. They are already part of the
/// contract so that the mobile app is written once; this is the single place to fill them.
/// </summary>
internal sealed record LaterLotFields(
    bool IsProfessional,
    WalkOrganizationResponse? Organization,
    bool RepeatsWeekly,
    bool HasBlockedParticipant)
{
    public static LaterLotFields For(Walk walk, Guid viewerId)
        => new(
            IsProfessional: false, // Lot 4: walk.OrganizationId is not null.
            Organization: null, // Lot 4: { id, name } of the walk's organisation.
            RepeatsWeekly: false, // Lot 3: the walk belongs to an active weekly series.
            HasBlockedParticipant: false); // Lot 4: the viewer blocked the organizer or an accepted participant (spec §4.7).
}

internal static class WalkQueries
{
    /// <summary>Projects walks to <see cref="WalkRow"/> (organizer and accepted dogs count) in one SQL query.</summary>
    public static IQueryable<WalkRow> ToRows(this IQueryable<Walk> walks) =>
        walks.Select(w => new WalkRow(w, w.Organizer, w.Registrations.Count(r => r.Status == RegistrationStatus.Accepted)));

    public static Task<int> CountAcceptedAsync(this DogoDbContext db, Guid walkId, CancellationToken cancellationToken) =>
        db.Registrations.CountAsync(r => r.WalkId == walkId && r.Status == RegistrationStatus.Accepted, cancellationToken);

    /// <summary>
    /// Loads a walk for writing and locks its row (<c>SELECT … FOR UPDATE</c>) until the
    /// current transaction ends. Every write that depends on the walk's capacity or on its
    /// accepted registrations takes this lock first, so concurrent requests are serialised.
    /// </summary>
    public static async Task<Walk?> LockWalkAsync(this DogoDbContext db, Guid id, CancellationToken cancellationToken)
    {
        if (db.Database.CurrentTransaction is null)
        {
            throw new InvalidOperationException("A walk can only be locked inside a transaction.");
        }

        var walks = await db.Walks.FromSql($"SELECT * FROM walks WHERE id = {id} FOR UPDATE").ToListAsync(cancellationToken);
        return walks.SingleOrDefault();
    }

    /// <summary>Builds the walk page as seen by <paramref name="viewerId"/>; null if the walk does not exist.</summary>
    public static async Task<WalkDetailResponse?> LoadDetailAsync(this DogoDbContext db, Guid id, Guid viewerId, CancellationToken cancellationToken)
    {
        var row = await db.Walks.AsNoTracking().Where(w => w.Id == id).ToRows().SingleOrDefaultAsync(cancellationToken);
        if (row is null)
        {
            return null;
        }

        var isOrganizer = row.Walk.OrganizerId == viewerId;
        var registrations = await db.Registrations.AsNoTracking()
            .Where(r => r.WalkId == id
                && (r.Status == RegistrationStatus.Accepted
                    || r.UserId == viewerId
                    || (isOrganizer && r.Status == RegistrationStatus.Pending)))
            .Include(r => r.Dog)
            .Include(r => r.User)
            .OrderBy(r => r.CreatedAt).ThenBy(r => r.Id)
            .ToListAsync(cancellationToken);

        // Registrations of a deleted dog (only possible on past walks) have no dog to show.
        var participants = registrations
            .Where(r => r.Status == RegistrationStatus.Accepted && r.Dog is not null)
            .Select(ParticipantResponse.From)
            .ToList();

        // Pending requests are visible only to the organizer and to their author (spec §4.3);
        // the author sees theirs in myRegistrations.
        var pending = isOrganizer
            ? registrations.Where(r => r.Status == RegistrationStatus.Pending && r.Dog is not null).Select(ParticipantResponse.From).ToList()
            : [];

        var mine = registrations.Where(r => r.UserId == viewerId).Select(MyRegistrationResponse.From).ToList();

        return WalkDetailResponse.From(row, LaterLotFields.For(row.Walk, viewerId), isOrganizer, participants, mine, pending);
    }
}
