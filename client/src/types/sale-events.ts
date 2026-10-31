// ============================================================================
// SALE EVENTS (Black Friday and later limited-slot sales)
// ============================================================================
//
// A sale lists tours, each with a ladder of discounted slots sold in order:
// slot 1 is the cheapest, and a party of N takes the next N free slots.
// Lives in its own collections so the legacy `discountEvents` (which the
// booking sheet looks up by name for historical bookings) stays untouched.
//
// Shapes here are what the API returns: timestamps are ISO strings.

export type SaleStatus = "draft" | "live" | "paused" | "ended";
export type SaleCheckoutMode = "auto" | "manual";

export interface SaleHero {
  title: string;
  subtitle: string;
  bannerUrl?: string;
  mobileBannerUrl?: string;
}

export interface SaleSeo {
  title?: string;
  description?: string;
  /** Image shown when the link is shared (1200×630). Falls back to the desktop banner. */
  ogImage?: string;
}

export interface SaleTour {
  tourPackageId: string;
  tourSlug: string;
  /** Card title on the sale page, e.g. "Argentina". */
  displayName: string;
  tourName: string;
  /** "From" price: the lowest upcoming date price (a date's own price, else the tour's). */
  originalPrice: number;
  /** Upcoming dates have different prices, so the sale price depends on the date. */
  pricesVary?: boolean;
  coverImage?: string;
  order: number;
}

export interface SaleEvent {
  id: string;
  slug: string;
  name: string;
  status: SaleStatus;
  startAt: string | null;
  /** null = end date TBA. */
  endAt: string | null;
  holdMinutes: number;
  checkoutMode: SaleCheckoutMode;
  hero: SaleHero;
  /** Search and link-share overrides; blanks fall back to the hero text and banner. */
  seo: SaleSeo;
  /** Extra links: www /<slug> forwards to the sale page. */
  redirectSlugs: string[];
  /** Where the sale page sends visitors while draft or ended ("" shows the default page). */
  fallbackUrl: string;
  /** Secret for the private preview link (www /sale-preview/<token>), works in any status. */
  previewToken: string;
  tours: SaleTour[];
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** `paying`: the holder pressed Pay; the slot can't be reclaimed mid-payment. */
export type SlotStatus = "available" | "held" | "paying" | "sold";

export interface SaleSlot {
  index: number; // 1-based position on the ladder
  discountGBP: number;
  salePrice: number;
  status: SlotStatus;
  holdId?: string | null;
  heldUntil?: string | null;
  holderEmail?: string | null;
  paymentDocId?: string | null;
  stripeIntentId?: string | null;
  bookingIds?: string[];
  soldAt?: string | null;
  /** Manual checkout mode, or an admin override for this slot. */
  paymentLinkUrl?: string | null;
  note?: string | null;
}

export interface SaleInventory {
  tourPackageId: string;
  slots: SaleSlot[];
  updatedAt?: string | null;
}

export type HoldStatus = "active" | "converted" | "expired" | "released" | "conflict";

/** Public view of a hold, as the reservation form and the sale page see it. */
export interface SaleHoldView {
  holdId: string;
  saleId: string;
  saleName: string;
  saleSlug: string;
  checkoutMode: SaleCheckoutMode;
  tourPackageId: string;
  tourSlug: string;
  tourName: string;
  displayName: string;
  partySize: number;
  /** salePrice/originalPrice are "from" prices until a date is chosen; discountGBP is fixed. */
  slots: { index: number; salePrice: number; originalPrice: number; discountGBP?: number; paymentLinkUrl?: string | null }[];
  status: HoldStatus;
  paying: boolean;
  /** What the countdown shows; the server keeps the hold a little longer. */
  displayExpiresAt: string;
  expiresAt: string;
  serverNow: string;
}

/** Public availability: no holder data. */
export type PublicSlotState = "available" | "on_hold" | "sold";

export interface PublicTourAvailability {
  tourPackageId: string;
  slots: { index: number; salePrice: number; discountGBP: number; state: PublicSlotState }[];
  left: number;
  onHold: number;
  nextPrice: number | null;
  /** Lowest upcoming date price the slot prices are based on. */
  fromPrice?: number;
  pricesVary?: boolean;
}

export interface PublicSaleAvailability {
  saleId: string;
  status: SaleStatus;
  isOpen: boolean;
  tours: PublicTourAvailability[];
  serverNow: string;
}
