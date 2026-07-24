// Shared Group/Duo booking identity helper.
//
// A Duo/Group booking is ONE travel party: the main booker plus their guests.
// The party is identified by a single `groupId` shared by every member's booking
// document. That code is always derived from the MAIN BOOKER's identity — never
// from a guest's — so guests inherit it rather than minting their own.

export const GROUP_BOOKING_TYPES = ["Duo Booking", "Group Booking"] as const;

/** True when the booking type represents a multi-traveller party. */
export function isGroupBookingType(bookingType: string | undefined | null): boolean {
  return (
    bookingType === "Duo Booking" || bookingType === "Group Booking"
  );
}

/**
 * Generate the shared group code for a travel party.
 *
 * Format: `<DB|GB>-<initials>-<hash4>-<member3>` (e.g. `DB-SO-4821-317`).
 * Always call this with the MAIN BOOKER's name/email — guests copy the result.
 *
 * @returns the code, or "" when the booking type is not Duo/Group.
 */
export function generateGroupCode(
  bookingType: string,
  tourName: string,
  firstName: string,
  lastName: string,
  email: string,
): string {
  if (!isGroupBookingType(bookingType)) return "";

  const initials =
    (firstName?.[0] ?? "").toUpperCase() + (lastName?.[0] ?? "").toUpperCase();
  const idPrefix = bookingType === "Duo Booking" ? "DB" : "GB";

  // Stable hash over the main booker's identity.
  const identity = `${bookingType}|${tourName}|${firstName}|${lastName}|${email}`;
  let hashNum = 0;
  for (let i = 0; i < identity.length; i++) {
    hashNum += identity.charCodeAt(i) * (i + 1);
  }
  const hashTag = String(Math.abs(hashNum) % 10000).padStart(4, "0");
  const memberNumber = String((Math.abs(hashNum) % 999) + 1).padStart(3, "0");

  return `${idPrefix}-${initials}-${hashTag}-${memberNumber}`;
}
