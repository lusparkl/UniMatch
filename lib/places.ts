// How places and times read to an applicant abroad: city names in the local script, short university names,
// and deadlines in the institution's own time zone with the days left.

const NATIVE: Record<string, string> = {
  "Hong Kong": "香港",
  Seoul: "서울",
  Daejeon: "대전",
  Pohang: "포항",
  Gwangju: "광주",
  Ulsan: "울산",
};
const COUNTRY_NATIVE: Record<string, string> = {
  "Hong Kong": "香港",
  "South Korea": "한국",
};
/** The city in its own script ("서울"), or "" when it is not known. */
export const nativeCity = (city: string) => NATIVE[city] ?? "";
export const nativeCountry = (country: string) => COUNTRY_NATIVE[country] ?? "";
/** "香港 · Hong Kong" or "서울 · Seoul, South Korea". */
export const placeName = (p: { city: string; country: string }) =>
  [nativeCity(p.city), p.city + (p.country !== p.city ? ", " + p.country : "")]
    .filter(Boolean)
    .join(" · ");

const SHORT: Record<string, string> = {
  "The University of Hong Kong": "HKU",
  "Hong Kong University of Science and Technology": "HKUST",
  "The Hong Kong Polytechnic University": "PolyU",
  "The Chinese University of Hong Kong": "CUHK",
  "Hong Kong Baptist University": "HKBU",
  "Yonsei University, Underwood International College": "Yonsei UIC",
};
/** A short university name: a known abbreviation, the leading acronym ("KAIST (…)") or the trailing one ("… (SKKU)"). */
export const shortUniversity = (name: string) =>
  SHORT[name] ??
  name.match(/^([A-Z]{3,}) \(/)?.[1] ??
  name.match(/\(([A-Z]{3,})\)$/)?.[1] ??
  name;

const ZONES: Record<string, string> = {
  "Asia/Hong_Kong": "HKT",
  "Asia/Seoul": "KST",
};
const DAY = 86_400_000;
/** Calendar fields of an instant in a time zone. */
function local(iso: string, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return {
    year: +parts.year,
    month: +parts.month - 1,
    day: +parts.day,
    time: parts.hour + ":" + parts.minute,
  };
}
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const MONTHS_LONG =
  "January February March April May June July August September October November December".split(
    " ",
  );
export type DeadlineParts = {
  passed: boolean;
  /** "Nov 25, 2026" */
  date: string;
  /** "Nov 25" */
  short: string;
  /** "23:59 HKT"; the zone name is left out when the source gives no time zone. */
  time: string;
  /** "November 2026" */
  month: string;
  /** "In 13 days", "Tomorrow", "Today" or "Passed", counted in the institution's calendar. */
  days: string;
  daysLeft: number;
};
/** A deadline as the institution states it: its own calendar day and clock, with the days left from `now`. */
export function deadlineParts(
  iso: string,
  timezone: string | null,
  now: Date,
): DeadlineParts {
  const zone = timezone ?? "UTC";
  let at, today;
  try {
    at = local(iso, zone);
    today = local(now.toISOString(), zone);
  } catch {
    at = local(iso, "UTC");
    today = local(now.toISOString(), "UTC");
  }
  const daysLeft = Math.round(
    (Date.UTC(at.year, at.month, at.day) -
      Date.UTC(today.year, today.month, today.day)) /
      DAY,
  );
  const passed = new Date(iso) < now;
  return {
    passed,
    date: MONTHS[at.month] + " " + at.day + ", " + at.year,
    short: MONTHS[at.month] + " " + at.day,
    time: at.time + (timezone ? " " + (ZONES[timezone] ?? timezone) : ""),
    month: MONTHS_LONG[at.month] + " " + at.year,
    days: passed
      ? "Passed"
      : daysLeft <= 0
        ? "Today"
        : daysLeft === 1
          ? "Tomorrow"
          : "In " + daysLeft + " days",
    daysLeft,
  };
}
