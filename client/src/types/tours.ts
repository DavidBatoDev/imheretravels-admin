import { Timestamp } from "firebase/firestore";

// ============================================================================
// TOUR PACKAGE CORE TYPES
// ============================================================================

// A previously-used slug that redirects to the tour's current slug on www.
// `redirect` is the per-slug override: false keeps the record but stops redirecting.
export interface PreviousSlug {
  slug: string;
  redirect: boolean;
}

export interface TourPackage {
  id: string; // Auto-generated Firestore ID
  name: string;
  slug: string; // URL-friendly ID
  url?: string; // Direct URL to tour page
  tourCode: string; // Tour code (e.g., SIA, PHS, PSS)
  description: string;
  destinations?: string[]; // Place/city names, e.g. ["Cebu", "Moalboal", "Siargao"]
  duration: string; // Duration in format "X days"
  cardHeaderTitle: string; // Label on the booking card (e.g. "11 Day Tour")
  cardSubHeader: string; // Subtitle on the booking card (e.g. "Argentina")
  travelDates: TravelDate[]; // Available travel dates
  pricing: TourPricing;
  details: TourDetails;
  media: TourMedia;
  status: "active" | "draft" | "archived";
  // NEW V2 FIELDS
  pricingHistory: PricingHistoryEntry[]; // Historical price versions
  currentVersion?: number; // Current pricing version number
  metadata: TourMetadata;
  // ADDITIONAL FIELDS FROM TABLE
  brochureLink?: string; // Google Drive or other brochure link
  stripePaymentLink?: string; // Stripe payment link
  preDeparturePack?: string; // Pre-departure pack link
  // WWW PRESENTATION FIELDS
  seo?: { title?: string; description?: string }; // SEO overrides; falls back to name/description
  comingSoon?: boolean; // Gate full content on www
  scheduledPublishAt?: Timestamp | null; // When set & in the future, a cron flips status→"active" at this time
  isHosted?: boolean; // Marks this tour as a hosted tour (independent of resident-host attachment)
  bookingSlug?: string; // Override slug used in booking/reservation URLs
  previousSlugs?: PreviousSlug[]; // Old slugs that redirect to the current slug on www
  depositNote?: string; // Full deposit notice text on booking card; falls back to auto-generated
  footnote?: string; // Booking card footnote; falls back to "Additional fees may apply"
}

// ============================================================================
// TRAVEL DATES TYPES
// ============================================================================

export interface TravelDate {
  startDate: Timestamp;
  endDate: Timestamp;
  tourDays?: number; // Number of days for the tour
  isAvailable: boolean;
  // Optional per-date custom pricing overrides
  customOriginal?: number | null;
  customDiscounted?: number | null;
  customDeposit?: number | null;
  // UI flags to explicitly add/remove individual custom fields
  hasCustomOriginal?: boolean;
  hasCustomDiscounted?: boolean;
  hasCustomDeposit?: boolean;
}

// ============================================================================
// TOUR DETAILS TYPES
// ============================================================================

export interface TourPricing {
  original: number;
  discounted?: number | null;
  deposit: number;
  currency: "USD" | "EUR" | "GBP";
}

export interface PricingHistoryEntry {
  version: number; // Version number (e.g., 1, 2, 3...)
  effectiveDate: Timestamp; // When this pricing took effect
  pricing: {
    original: number;
    discounted?: number;
    deposit: number;
    currency: string;
  };
  travelDates?: Array<{
    date: string; // ISO date string
    customOriginal?: number;
    customDiscounted?: number;
    customDeposit?: number;
  }>;
  changedBy?: string; // Admin user ID
  reason?: string; // Why prices were updated
}

export interface Highlight {
  text: string;
  image?: string;
  subtitle?: string; // Drives tripHighlights subtitle on www
}

export interface TourDetails {
  highlights: (string | Highlight)[];
  itinerary: TourItinerary[];
  requirements: string[];
  // WWW presentation sections (all optional; added additively)
  keyFacts?: Array<{ icon: string; label: string; values: string[] }>; // Editable key facts; Tour Dates always derived
  tags?: Array<{ label: string; icon: string }>; // Header location/theme tags; falls back to location + destinations
  inclusions?: TourInclusion[]; // "What's Included" section
  accommodations?: TourAccommodation[]; // "Where We Stay" section
  faqs?: TourFaq[]; // FAQ section
  thingsToKnow?: TourThingToKnow[]; // "Things to Know" cards (per-tour override)
  tips?: TourTip[]; // Tips section (per-tour override)
  reviews?: TourReview[]; // "What people say about us" section; falls back to generic placeholders on www when absent
  map?: { image?: string; embedUrl?: string }; // Map section
}

export interface TourInclusion {
  icon?: string; // TourIcon value (e.g. "meals", "transport", "activities")
  label: string;
  value: string | string[];
}

export interface TourAccommodation {
  image: string;
  name: string;
  nights: string; // e.g. "2 nights in Hotel"
}

export interface TourFaq {
  question: string;
  answer: string;
}

export interface TourThingToKnow {
  icon?: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface TourTip {
  icon?: string;
  title: string;
  description: string;
}

export interface TourReview {
  rating: number;           // 1–5 stars
  date: string;             // e.g. "May 2023"
  body: string;             // Review text
  reviewerName: string;     // e.g. "Flynn Deanne"
  reviewerLocation: string; // e.g. "London, United Kingdom"
  reviewerAvatar?: string;  // Optional URL / storage path
}

export interface TourItinerary {
  day: number;
  title: string;
  description: string;
  // Optional per-day presentation fields
  image?: string;
  accommodation?: string; // kept — backward compat fallback
  activities?: string;    // kept — backward compat fallback
  meals?: string;         // kept — backward compat fallback
  details?: Array<{ icon: string; label: string; value: string }>;
}

export interface TourMedia {
  coverImage: string; // Storage path
  gallery: string[]; // Storage paths
}

export interface TourMetadata {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string; // Reference to users
  bookingsCount: number;
}

// ============================================================================
// TOUR STATISTICS TYPES
// ============================================================================

export interface TourStatistics {
  id: string; // "2025-06"
  bookings: number;
  revenue: number;
  cancellations: number;
  avgBookingValue: number;
}

// ============================================================================
// FORM TYPES
// ============================================================================

export interface TourPackageFormData {
  name: string;
  slug: string;
  url?: string;
  tourCode: string;
  description: string;
  duration: string; // Duration in format "X days"
  travelDates: TravelDate[];
  pricing: {
    original: number;
    discounted?: number;
    deposit: number;
    currency: "USD" | "EUR" | "GBP";
  };
  details: {
    highlights: string[];
    itinerary: TourItinerary[];
    requirements: string[];
  };
  media?: {
    coverImage?: string;
    gallery?: string[];
  };
  status: "active" | "draft" | "archived";
  isHosted?: boolean;
  brochureLink?: string;
  stripePaymentLink?: string;
  preDeparturePack?: string;
  // Note: pricingHistory is managed automatically by the system
}

// Form data with string dates (what the form actually sends)
export interface TourFormDataWithStringDates {
  name: string;
  slug: string;
  url?: string;
  tourCode: string;
  description: string;
  duration: string; // Duration as a string like "11 days"
  cardHeaderTitle: string;
  cardSubHeader: string;
  travelDates: {
    startDate: string;
    endDate: string;
    tourDays?: number; // Number of days for the tour
    isAvailable: boolean;
    // Optional per-date custom pricing values
    customOriginal?: number | null;
    customDiscounted?: number | null;
    customDeposit?: number | null;
    // UI flags to explicitly add/remove individual custom fields
    hasCustomOriginal?: boolean;
    hasCustomDiscounted?: boolean;
    hasCustomDeposit?: boolean;
  }[];
  pricing: {
    original: number;
    discounted?: number | null;
    deposit: number;
    currency: "USD" | "EUR" | "GBP";
  };
  details: {
    highlights: string[];
    itinerary: TourItinerary[];
    requirements: string[];
  };
  media?: {
    coverImage?: string;
    gallery?: string[];
  };
  status: "active" | "draft" | "archived";
  scheduledPublishAt?: string | null; // ISO datetime string; cron flips status→"active" at this time
  isHosted?: boolean;
  destinations?: string[];
  brochureLink?: string;
  stripePaymentLink?: string;
  preDeparturePack?: string;
  previousSlugs?: PreviousSlug[];
}

// ============================================================================
// TOUR STATUS TYPES
// ============================================================================

export type TourStatus = "active" | "draft" | "archived";

export type TourDuration = "1-3 days" | "4-7 days" | "8-14 days" | "15+ days";

// Tour codes from the table
export type TourCode =
  | "SIA" // Siargao Island Adventure
  | "PHS" // Philippine Sunrise
  | "PSS" // Philippine Sunset
  | "MLB" // Maldives Bucketlist
  | "SLW" // Sri Lanka Wander Tour
  | "ARW" // Argentina's Wonders
  | "BZT" // Brazil's Treasures
  | "VNE" // Vietnam Expedition
  | "IDD" // India Discovery Tour
  | "IHF" // India Holi Festival Tour
  | "TXP" // Tanzania Exploration
  | "NZE"; // New Zealand Expedition

// ============================================================================
// FILTER AND SEARCH TYPES
// ============================================================================

export interface TourFilters {
  status?: TourStatus;
  duration?: TourDuration;
  priceRange?: {
    min: number;
    max: number;
  };
  search?: string;
}

export interface TourSearchParams {
  query: string;
  filters: TourFilters;
  sortBy: "name" | "price" | "duration" | "bookings" | "createdAt";
  sortOrder: "asc" | "desc";
  page: number;
  limit: number;
}

// ============================================================================
// TOUR SUMMARY TYPES (FOR TABLE DISPLAY)
// ============================================================================

export interface TourSummary {
  id: string;
  name: string;
  url?: string;
  brochureLink?: string;
  destinations: string;
  tourCode: string;
  duration: string;
  travelDates: string;
  tripDescription: string;
  tripHighlights: string;
  itinerarySummary: string;
  stripePaymentLink?: string;
  preDeparturePack?: string;
  originalCost: number;
  discountedCost?: number;
  reservationFee: number;
  currency: string;
  status: TourStatus;
}

// ============================================================================
// TOUR PACKAGE CREATION/UPDATE TYPES
// ============================================================================

export interface CreateTourPackageData {
  name: string;
  tourCode: string;
  description: string;
  destinations: string[];
  duration: string; // Duration in format "X days"
  travelDates: TravelDate[];
  highlights: string[];
  itinerary: TourItinerary[];
  pricing: {
    original: number;
    discounted?: number;
    deposit: number;
    currency: "USD" | "EUR" | "GBP";
  };
  brochureLink?: string;
  stripePaymentLink?: string;
  preDeparturePack?: string;
  coverImage?: string;
  gallery?: string[];
}

export interface UpdateTourPackageData extends Partial<CreateTourPackageData> {
  id: string;
  updatedAt: Timestamp;
  updatedBy: string;
}
