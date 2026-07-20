/**
 * Shared SEO/URL template for destinations.
 *
 * Every destination follows the same title pattern — "{Name} Tours — I'm Here
 * Travels" — and a slugified URL. The description is seeded with a clean generic
 * the admin can then refine per country. Used by the create-time auto-fill and
 * the "Apply suggested SEO & URL" prompt in the settings panel.
 */

import { generateSlug } from "@/utils";

const TITLE_SUFFIX = "Tours — I'm Here Travels";
const DESC_TAIL = "tours and adventures built for curious, social travellers.";

export interface SeoSuggestion {
  title: string;
  description: string;
  slug: string;
}

/** Build the templated SEO title / description / slug from a destination name. */
export function buildDestinationSeo(name: string): SeoSuggestion {
  const n = (name ?? "").trim();
  if (!n) return { title: "", description: "", slug: "" };
  return {
    title: `${n} ${TITLE_SUFFIX}`,
    description: `Explore ${n} with I'm Here Travels — small-group ${n} ${DESC_TAIL}`,
    slug: generateSlug(n),
  };
}

/** True when a title still matches the auto-template (safe to re-sync on rename). */
export function isAutoSeoTitle(title: string): boolean {
  return new RegExp(`^.+\\s${TITLE_SUFFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`).test(
    (title ?? "").trim(),
  );
}

/** True when a description still matches the auto-template (safe to re-sync on rename). */
export function isAutoSeoDescription(description: string): boolean {
  const d = (description ?? "").trim();
  return d.startsWith("Explore ") && d.endsWith(DESC_TAIL);
}

export interface SeoValues {
  name?: string;
  slug?: string;
  seo?: { title?: string; description?: string };
}

/**
 * The subset of SEO/URL fields that applying the template WOULD change, using
 * safe rules: the title re-syncs when empty or still auto-generated; the slug
 * and description are only filled when empty (never clobber a live URL or
 * hand-written copy). An empty object means there's nothing to suggest.
 */
export function pendingSeoPatch(values: SeoValues): Partial<SeoSuggestion> {
  const sug = buildDestinationSeo(values.name ?? "");
  if (!sug.title) return {};

  const patch: Partial<SeoSuggestion> = {};

  const curTitle = values.seo?.title ?? "";
  if ((!curTitle.trim() || isAutoSeoTitle(curTitle)) && curTitle !== sug.title) {
    patch.title = sug.title;
  }

  const curDesc = values.seo?.description ?? "";
  if (
    (!curDesc.trim() || isAutoSeoDescription(curDesc)) &&
    sug.description &&
    curDesc !== sug.description
  ) {
    patch.description = sug.description;
  }

  const curSlug = values.slug ?? "";
  if (!curSlug.trim() && sug.slug) patch.slug = sug.slug;

  return patch;
}
