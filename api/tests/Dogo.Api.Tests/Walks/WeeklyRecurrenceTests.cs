using System.Globalization;
using Dogo.Api.Features.Walks;

namespace Dogo.Api.Tests.Walks;

/// <summary>Date arithmetic of weekly series in Europe/Paris (no database).</summary>
public sealed class WeeklyRecurrenceTests
{
    private static readonly TimeZoneInfo Paris = TimeZoneInfo.FindSystemTimeZoneById("Europe/Paris");

    private static DateTimeOffset Utc(string value) => DateTimeOffset.Parse(value, CultureInfo.InvariantCulture).ToUniversalTime();

    [Theory]
    // Same offset: exactly seven days.
    [InlineData("2031-06-03T08:00:00Z", "2031-06-03T08:01:00Z", "2031-06-10T08:00:00Z")]
    // Spring forward (30 March 2031): 10:00 CET then 10:00 CEST.
    [InlineData("2031-03-29T09:00:00Z", "2031-03-29T09:01:00Z", "2031-04-05T08:00:00Z")]
    // Fall back (26 October 2031): 10:00 CEST then 10:00 CET.
    [InlineData("2031-10-25T08:00:00Z", "2031-10-25T08:01:00Z", "2031-11-01T09:00:00Z")]
    // 02:30 does not exist on 30 March 2031: moved forward by the gap, to 03:30 CEST.
    [InlineData("2031-03-23T01:30:00Z", "2031-03-23T01:31:00Z", "2031-03-30T01:30:00Z")]
    // 02:30 occurs twice on 26 October 2031: the first one (CEST) is taken.
    [InlineData("2031-10-19T00:30:00Z", "2031-10-19T00:31:00Z", "2031-10-26T00:30:00Z")]
    // Server down for three weeks: only the first future occurrence.
    [InlineData("2031-06-03T08:00:00Z", "2031-06-24T09:00:00Z", "2031-07-01T08:00:00Z")]
    // Down across a clock change: still 10:00 local.
    [InlineData("2031-03-15T09:00:00Z", "2031-04-01T00:00:00Z", "2031-04-05T08:00:00Z")]
    // Exactly at an occurrence: it has started, so the following one.
    [InlineData("2031-06-03T08:00:00Z", "2031-06-10T08:00:00Z", "2031-06-17T08:00:00Z")]
    public void Next_start_keeps_the_local_time(string previous, string now, string expected)
    {
        Assert.Equal(Utc(expected), WeeklyRecurrence.NextStart(Utc(previous), Paris, Utc(now)));
    }

    [Fact]
    public void A_nonexistent_local_time_is_moved_forward()
    {
        var instant = WeeklyRecurrence.ToInstant(new DateTime(2031, 3, 30, 2, 30, 0), Paris);

        Assert.Equal(Utc("2031-03-30T01:30:00Z"), instant);
        Assert.Equal(new DateTime(2031, 3, 30, 3, 30, 0), TimeZoneInfo.ConvertTime(instant, Paris).DateTime);
    }

    [Fact]
    public void An_ambiguous_local_time_takes_its_first_occurrence()
    {
        Assert.Equal(Utc("2031-10-26T00:30:00Z"), WeeklyRecurrence.ToInstant(new DateTime(2031, 10, 26, 2, 30, 0), Paris));
    }

    [Fact]
    public void A_series_started_at_the_same_time_every_week_stays_local_for_a_year()
    {
        var start = Utc("2031-01-07T09:00:00Z"); // Tuesday 10:00 CET
        var current = start;
        for (var week = 0; week < 52; week++)
        {
            current = WeeklyRecurrence.NextStart(current, Paris, current);
            var local = TimeZoneInfo.ConvertTime(current, Paris);
            Assert.Equal((DayOfWeek.Tuesday, 10, 0), (local.DayOfWeek, local.Hour, local.Minute));
        }
    }
}
