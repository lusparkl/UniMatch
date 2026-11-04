// Owner decision (2026-11-01): Hong Kong institutions publish admission dates in Hong Kong time.
// Neither zone has daylight saving, so a fixed offset is exact.
const zones: Record<string, { zone: string; offset: string }> = {
  "Hong Kong": { zone: "Asia/Hong_Kong", offset: "+08:00" },
  // Korean institutions publish dates in Korea Standard Time, which also has no daylight saving.
  "South Korea": { zone: "Asia/Seoul", offset: "+09:00" },
};
export const institutionZone = (country: string) => zones[country] ?? null;
/**
 * Pins a page-quoted date to the institution's time zone. Extraction writes the page's wall-clock time
 * with a "Z" or no offset; an explicit non-UTC offset is kept. A date without a time (midnight) is the
 * end of that day for a deadline and its start for an opening date.
 */
export function institutionDate(
  value: string | null,
  country: string,
  endOfDay: boolean,
) {
  const zone = institutionZone(country);
  if (!value || !zone || /[+-]\d{2}:\d{2}$/.test(value)) return value;
  const wall = value.slice(0, 19);
  const time = wall.slice(11) || "00:00:00";
  return (
    wall.slice(0, 10) +
    "T" +
    (endOfDay && time === "00:00:00" ? "23:59:59" : time) +
    zone.offset
  );
}
