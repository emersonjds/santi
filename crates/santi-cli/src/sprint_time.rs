//! Sprint times read and shown in a zone (D48): the CLI passes `Local`, tests a fixed offset.
use std::fmt::Display;

use chrono::{
    DateTime, Days, DurationRound, Local, MappedLocalTime, Months, NaiveDate, NaiveDateTime,
    NaiveTime, TimeDelta, TimeZone, Utc,
};
use santi_types::sprints::SprintLength;

pub fn end_of_day() -> NaiveTime {
    NaiveTime::from_hms_opt(23, 59, 0).expect("23:59 exists")
}

pub fn now_to_the_minute() -> DateTime<Local> {
    Local::now()
        .duration_trunc(TimeDelta::minutes(1))
        .expect("now fits a minute")
}

/// `YYYY-MM-DD HH:MM`, `YYYY-MM-DD` (at `day_time`) in `zone`, or RFC 3339.
pub fn parse_moment<Tz: TimeZone>(
    text: &str,
    zone: &Tz,
    day_time: NaiveTime,
    flag: &str,
) -> Result<DateTime<Tz>, String> {
    if let Ok(moment) = DateTime::parse_from_rfc3339(text) {
        return Ok(moment.with_timezone(zone));
    }
    let local = NaiveDateTime::parse_from_str(text, "%Y-%m-%d %H:%M")
        .or_else(|_| NaiveDate::parse_from_str(text, "%Y-%m-%d").map(|day| day.and_time(day_time)))
        .map_err(|_| {
            format!("{flag} takes YYYY-MM-DD, 'YYYY-MM-DD HH:MM' or RFC 3339, not `{text}`")
        })?;
    single(zone.from_local_datetime(&local), flag)
}

pub fn single<T>(result: MappedLocalTime<T>, flag: &str) -> Result<T, String> {
    match result {
        MappedLocalTime::Single(moment) => Ok(moment),
        MappedLocalTime::Ambiguous(..) => Err(format!(
            "{flag}: that local time happens twice (clock change); add an offset"
        )),
        MappedLocalTime::None => Err(format!(
            "{flag}: that local time does not exist (clock change)"
        )),
    }
}

/// Where a preset ends: `1d` at 23:59 of the start's local day, `1m` on the same day next month (clamped).
pub fn sprint_window<Tz: TimeZone>(
    start: &DateTime<Tz>,
    length: SprintLength,
) -> Result<DateTime<Tz>, String> {
    let end = match length {
        SprintLength::FourHours => Some(start.clone() + TimeDelta::hours(4)),
        SprintLength::OneDay => start
            .timezone()
            .from_local_datetime(&start.date_naive().and_time(end_of_day()))
            .single(),
        SprintLength::OneWeek => start.clone().checked_add_days(Days::new(7)),
        SprintLength::TwoWeeks => start.clone().checked_add_days(Days::new(14)),
        SprintLength::OneMonth => start.clone().checked_add_months(Months::new(1)),
        SprintLength::Minutes(minutes) => Some(start.clone() + TimeDelta::minutes(minutes.into())),
    };
    end.ok_or_else(|| "--for: the end falls on a clock change; use --end".to_string())
}

pub fn custom_length<Tz: TimeZone>(
    start: &DateTime<Tz>,
    end: &DateTime<Tz>,
) -> Option<SprintLength> {
    let minutes = end.clone().signed_duration_since(start).num_minutes();
    u32::try_from(minutes)
        .ok()
        .filter(|minutes| (1..=9_999_999).contains(minutes))
        .map(SprintLength::Minutes)
}

pub fn window_text<Tz: TimeZone>(start: DateTime<Utc>, end: DateTime<Utc>, zone: &Tz) -> String
where
    Tz::Offset: Display,
{
    format!(
        "{} → {}",
        start.with_timezone(zone).format("%Y-%m-%d %H:%M"),
        end.with_timezone(zone).format("%Y-%m-%d %H:%M %:z")
    )
}

#[cfg(test)]
mod tests {
    use chrono::FixedOffset;

    use super::*;

    fn zone() -> FixedOffset {
        FixedOffset::west_opt(3 * 3600).unwrap()
    }

    fn at(text: &str) -> DateTime<Utc> {
        text.parse().unwrap()
    }

    fn local(zone: &FixedOffset, text: &str) -> DateTime<FixedOffset> {
        parse_moment(text, zone, NaiveTime::MIN, "--start").unwrap()
    }

    #[test]
    fn local_text_reads_in_the_given_zone() {
        let read = |text: &str, day_time: NaiveTime| {
            parse_moment(text, &zone(), day_time, "--end").map(|moment| moment.with_timezone(&Utc))
        };
        assert_eq!(
            read("2026-10-16 22:00", NaiveTime::MIN),
            Ok(at("2026-10-17T01:00:00Z"))
        );
        assert_eq!(
            read("2026-10-16", end_of_day()),
            Ok(at("2026-10-17T02:59:00Z"))
        );
        assert_eq!(
            read("2026-10-16", NaiveTime::MIN),
            Ok(at("2026-10-16T03:00:00Z"))
        );
        assert_eq!(
            read("2026-10-16T22:00:00Z", NaiveTime::MIN),
            Ok(at("2026-10-16T22:00:00Z"))
        );
        let error = read("tomorrow", end_of_day()).unwrap_err();
        assert!(
            error.contains("--end") && error.contains("YYYY-MM-DD"),
            "{error}"
        );
    }

    #[test]
    fn clock_changes_are_refused_naming_the_flag() {
        let error = single(MappedLocalTime::<i32>::None, "--end").unwrap_err();
        assert!(
            error.contains("--end") && error.contains("does not exist"),
            "{error}"
        );
        let error = single(MappedLocalTime::Ambiguous(1, 2), "--start").unwrap_err();
        assert!(
            error.contains("--start") && error.contains("happens twice"),
            "{error}"
        );
        assert_eq!(single(MappedLocalTime::Single(1), "--end"), Ok(1));
    }

    #[test]
    fn presets_end_where_the_brief_says() {
        let zone = zone();
        let start = local(&zone, "2026-10-16 18:00");
        for (length, end) in [
            (SprintLength::FourHours, "2026-10-16 22:00"),
            (SprintLength::OneDay, "2026-10-16 23:59"),
            (SprintLength::OneWeek, "2026-10-23 18:00"),
            (SprintLength::TwoWeeks, "2026-10-30 18:00"),
            (SprintLength::OneMonth, "2026-11-16 18:00"),
            (SprintLength::Minutes(90), "2026-10-16 19:30"),
        ] {
            assert_eq!(
                sprint_window(&start, length),
                Ok(local(&zone, end)),
                "{length}"
            );
        }
        assert_eq!(
            sprint_window(&local(&zone, "2027-01-31 09:00"), SprintLength::OneMonth),
            Ok(local(&zone, "2027-02-28 09:00"))
        );
    }

    #[test]
    fn one_day_ends_on_the_local_day_at_zone_edges() {
        let end = |zone: FixedOffset| {
            sprint_window(&local(&zone, "2026-10-16 22:00"), SprintLength::OneDay)
                .unwrap()
                .with_timezone(&Utc)
        };
        assert_eq!(
            end(FixedOffset::east_opt(14 * 3600).unwrap()),
            at("2026-10-16T09:59:00Z")
        );
        assert_eq!(
            end(FixedOffset::west_opt(12 * 3600).unwrap()),
            at("2026-10-17T11:59:00Z")
        );
    }

    #[test]
    fn custom_length_counts_minutes() {
        let zone = zone();
        let start = local(&zone, "2026-10-16 18:00");
        assert_eq!(
            custom_length(&start, &local(&zone, "2026-10-16 19:30")),
            Some(SprintLength::Minutes(90))
        );
        assert_eq!(custom_length(&start, &start), None);
        assert_eq!(
            custom_length(&start, &local(&zone, "2026-10-16 17:00")),
            None
        );
    }

    #[test]
    fn window_text_shows_local_times_and_offset() {
        assert_eq!(
            window_text(
                at("2026-10-16T12:00:00Z"),
                at("2026-10-17T01:00:00Z"),
                &zone()
            ),
            "2026-10-16 09:00 → 2026-10-16 22:00 -03:00"
        );
    }
}
