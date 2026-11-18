namespace Dogo.Api.Features.Walks;

/// <summary>
/// Date arithmetic of weekly series (spec §4.5): the next walk is seven days later at the same
/// local time of day in the series time zone, so a 10:00 walk stays at 10:00 across
/// daylight-saving changes (its UTC time moves by an hour).
/// </summary>
public static class WeeklyRecurrence
{
    /// <summary>
    /// The first weekly occurrence after <paramref name="previousStart"/> that lies strictly after
    /// <paramref name="now"/>. Occurrences missed while the server was down are skipped.
    /// </summary>
    public static DateTimeOffset NextStart(DateTimeOffset previousStart, TimeZoneInfo zone, DateTimeOffset now)
    {
        var local = TimeZoneInfo.ConvertTime(previousStart, zone).DateTime;

        // Start close to the answer after a long downtime; offsets differ by an hour at most.
        var weeks = Math.Max(1, (int)((now - previousStart).TotalDays / 7));
        while (true)
        {
            var candidate = ToInstant(local.AddDays(7 * weeks), zone);
            if (candidate > now)
            {
                return candidate;
            }

            weeks++;
        }
    }

    /// <summary>
    /// The instant of a local date and time in <paramref name="zone"/>. A time skipped when clocks
    /// go forward (02:30 on the last Sunday of March in Paris) is moved forward by the length of
    /// the gap (03:30); a time that occurs twice when clocks go back takes its first occurrence.
    /// </summary>
    public static DateTimeOffset ToInstant(DateTime local, TimeZoneInfo zone)
    {
        local = DateTime.SpecifyKind(local, DateTimeKind.Unspecified);
        TimeSpan offset;
        if (zone.IsInvalidTime(local))
        {
            // The offset in force just before the gap (transitions are never a day apart).
            offset = zone.GetUtcOffset(local.AddDays(-1));
        }
        else if (zone.IsAmbiguousTime(local))
        {
            // The larger offset is the earlier instant (still on summer time).
            offset = zone.GetAmbiguousTimeOffsets(local).Max();
        }
        else
        {
            offset = zone.GetUtcOffset(local);
        }

        return new DateTimeOffset(local, offset).ToUniversalTime();
    }
}
