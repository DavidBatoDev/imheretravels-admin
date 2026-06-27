/**
 * Helpers for interpreting/displaying scheduled-publish times in Asia/Manila
 * (Philippine Time). PH observes no DST, so the offset is a constant +08:00.
 *
 * The tour form uses a bare `datetime-local` wall-clock value (no timezone).
 * We pin that wall-clock to Manila on both ends so the admin's picked time
 * means the same thing regardless of their browser or the server's timezone.
 */

const MANILA_OFFSET = "+08:00"; // Philippines has no daylight saving time
const MANILA_TZ = "Asia/Manila";

/** Normalize a Firestore Timestamp / Date / ISO string / {seconds} into a Date. */
function normalizeToDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object") {
    if (typeof value.toDate === "function") {
      const d = value.toDate();
      return d instanceof Date && !isNaN(d.getTime()) ? d : null;
    }
    if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
    if (typeof value._seconds === "number")
      return new Date(value._seconds * 1000);
  }
  return null;
}

/**
 * Interpret a `datetime-local` wall-clock string ("YYYY-MM-DDTHH:mm") as
 * Asia/Manila time and return the absolute instant. Returns null when blank or
 * unparseable. If the string already carries an offset or Z, it's respected.
 */
export function manilaLocalToDate(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const m = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!m) {
    // Already has an offset/Z (or some other form) — parse as-is.
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  const [, y, mo, da, h, mi, s] = m;
  const iso = `${y}-${mo}-${da}T${h}:${mi}:${s ?? "00"}${MANILA_OFFSET}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format an absolute instant (Timestamp/Date/ISO/{seconds}) as a
 * `datetime-local` wall-clock string ("YYYY-MM-DDTHH:mm") in Asia/Manila, so
 * the form shows the same Manila time the admin originally picked.
 */
export function dateToManilaLocalInput(value: unknown): string {
  const date = normalizeToDate(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  let hour = get("hour");
  if (hour === "24") hour = "00"; // some runtimes emit "24" for midnight
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}
