/**
 * Normalize loosely typed booking duration values for display.
 *
 * Historical bookings store strings such as "11 days", while some imports and
 * seed data store a number (or a numeric string). Preserve already formatted
 * copy and add the unit only when it is missing.
 */
export function formatTourDuration(value: unknown): string {
  if (value === null || value === undefined) return "";

  const duration = String(value).trim();
  if (!duration) return "";

  if (/^\d+(?:\.\d+)?$/.test(duration)) {
    return `${duration} ${Number(duration) === 1 ? "day" : "days"}`;
  }

  return duration;
}
