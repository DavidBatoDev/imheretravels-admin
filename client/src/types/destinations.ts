import { Timestamp } from "firebase/firestore";

// ============================================================================
// DESTINATION CORE TYPES
// ============================================================================
//
// Backs the `destinations` Firestore collection. The shape mirrors the www
// `Destination` type (www/data/destinations.ts) so the admin can author the
// same content the public destination pages render, plus admin conventions
// (`status`, `metadata`) and the relational `tourSlugs` used to group which
// tourPackages belong to this destination/country.
//
// Note: the www read model exposes SEO as `meta: { title, description }`; here
// (like resident hosts) we store it as `seo` and the www `toDestination()`
// mapper normalizes `seo → meta`.

export interface Destination {
  id: string; // Auto-generated Firestore ID
  slug: string; // URL-friendly ID, e.g. "philippines" → /all-destinations/philippines
  name: string; // e.g. "Philippines"
  region: string; // e.g. "Southeast Asia"
  status: "active" | "draft" | "archived"; // Controls www visibility

  // Hero
  heroImage: string;
  heroImageAlt: string;

  // SEO overrides; fall back to name / first description paragraph
  seo?: { title?: string; description?: string };

  // ── Static content (manually authored) ─────────────────────────────────────
  description: string[]; // Welcome intro paragraphs
  quickFacts?: DestinationQuickFact[]; // Quick-glance facts below the hero
  highlights?: DestinationHighlight[]; // Optional Highlights carousel override
  faqs?: DestinationFaq[]; // Destination FAQs
  community?: DestinationCommunity; // "With @Imheretravels" grid

  // ── Relational — which tours belong to this destination ────────────────────
  tourSlugs: string[]; // tourPackages slugs grouped under this destination

  // ── Per-destination review overrides (destinations only; never mutate the
  //    review's global status) ────────────────────────────────────────────────
  hiddenReviewIds?: string[]; // reviews hidden on THIS destination page
  featuredReviewIds?: string[]; // reviews added to THIS destination page from any tour

  metadata: DestinationMetadata;
}

export interface DestinationFaq {
  question: string;
  answer: string;
}

export interface DestinationCommunityImage {
  src: string;
  alt: string;
  href: string;
}

export interface DestinationCommunity {
  heading: string;
  images: DestinationCommunityImage[];
}

export interface DestinationQuickFact {
  /** One of: "currency" | "beer" | "hello" | "dish" */
  icon: string;
  label: string;
  value: string;
}

export interface DestinationHighlight {
  image: string;
  imageAlt: string;
  title: string;
  description: string;
}

export interface DestinationMetadata {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string; // Reference to users
}

// ============================================================================
// FORM TYPES (what the form actually sends — no Timestamp content fields)
// ============================================================================

export interface DestinationFormData {
  slug: string;
  name: string;
  region: string;
  status: "active" | "draft" | "archived";
  heroImage: string;
  heroImageAlt: string;
  seo?: { title?: string; description?: string };
  description: string[];
  quickFacts?: DestinationQuickFact[];
  highlights?: DestinationHighlight[];
  faqs?: DestinationFaq[];
  community?: DestinationCommunity;
  tourSlugs: string[];
  hiddenReviewIds?: string[];
  featuredReviewIds?: string[];
}

// ============================================================================
// FILTER TYPES
// ============================================================================

export type DestinationStatus = "active" | "draft" | "archived";

export interface DestinationFilters {
  status?: DestinationStatus;
  search?: string;
}
