"use client";

/**
 * TourPageEditor — WYSIWYG inline editor that renders the tour page exactly as
 * it appears on www (layout, typography, booking card, section order) with all
 * content fields editable in place, WordPress-style.
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Save, ArrowLeft, Plus, X, Minus, Upload, Image as ImageIcon,
  Route, MapPin, Calendar, Clock, Hotel, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Copy, AlertCircle, Globe, Settings, ExternalLink, Plane,
  CheckCircle2, Utensils, Bus, Compass, HeartHandshake, Info,
  HelpCircle, Download, Camera, Luggage, ShieldCheck, Sun, Users, Pencil,
  Undo2, Redo2, RotateCcw, Eye,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useUndoRedo } from "@/hooks/use-undo-redo";

import { TourPackage, TourFormDataWithStringDates } from "@/types/tours";
import {
  createBlobUrl, revokeBlobUrl, cleanupBlobUrls,
  uploadAllBlobsToStorage, validateImageFile,
} from "@/utils/blob-image";
import { generateSlug } from "@/utils";
import { dateToManilaLocalInput } from "@/lib/manila-time";
import { updateTourMedia, cleanupRemovedGalleryImages } from "@/services/tours-service";
import {
  SortableList,
  SortableItem,
  DragHandle,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  rectSortingStrategy,
} from "./dnd/SortableList";
import TourDatePicker from "./TourDatePicker";
import ImagePickerModal from "@/components/shared/ImagePickerModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import TourSettingsPanel from "./TourSettingsPanel";
import SlugChangeModal from "./SlugChangeModal";
import HeroSetupPanel from "./HeroSetupPanel";
import TravelDatesModal from "./TravelDatesModal";
import ResetChangesModal from "@/components/shared/ResetChangesModal";
import ConfirmLeaveModal from "@/components/shared/ConfirmLeaveModal";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

// ─── Zod helpers ──────────────────────────────────────────────────────────────

const toOptionalNumber = (v: unknown): number | undefined => {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const optNum = z.preprocess(toOptionalNumber, z.number().optional());

// Local paths like "/tours/slug/image.webp" are valid static assets on www but
// can't load in the admin app. Resolve them against the www base URL.
const WWW_BASE = "https://www.imheretravels.com";
const resolveImg = (url: string | null | undefined): string => {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("http")) return url;
  // Review preset avatars are bundled in the admin app's own /public too, so serve
  // them same-origin — no dependency on a www deploy to preview them.
  if (url.startsWith("/reviews/")) return url;
  if (url.startsWith("/")) return `${WWW_BASE}${url}`;
  return url;
};

const toDateValue = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "object" && "_seconds" in (v as any)) return new Date((v as any)._seconds * 1000);
  // firebase-admin serializes Timestamps as {seconds, nanoseconds} (no underscore)
  if (typeof v === "object" && "seconds" in (v as any) && !("toDate" in (v as any))) return new Date((v as any).seconds * 1000);
  if (typeof v === "object" && "toDate" in (v as any)) { const d = (v as any).toDate(); return isNaN(d.getTime()) ? null : d; }
  const d = new Date(v as any);
  return isNaN(d.getTime()) ? null : d;
};
const toIso = (v: unknown) => { const d = toDateValue(v); return d ? d.toISOString().split("T")[0] : ""; };

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  url: z.string().url().optional().or(z.literal("")),
  tourCode: z.string().min(1),
  description: z.string().min(1),
  duration: z.string().min(1),
  cardHeaderTitle: z.string(),
  cardSubHeader: z.string(),
  status: z.enum(["active", "draft", "archived"]),
  scheduledPublishAt: z.string().nullish(),
  comingSoon: z.boolean().default(false),
  isHosted: z.boolean().default(false),
  bookingSlug: z.string().optional().or(z.literal("")),
  previousSlugs: z
    .array(z.object({ slug: z.string(), redirect: z.boolean() }))
    .optional(),
  seo: z.object({ title: z.string().optional(), description: z.string().optional() }).optional(),
  destinations: z.array(z.string()).optional(),
  stripePaymentLink: z.string().url().optional().or(z.literal("")),
  depositNote: z.string().optional().or(z.literal("")),
  footnote: z.string().optional().or(z.literal("")),
  brochureLink: z.string().url().optional().or(z.literal("")),
  preDeparturePack: z.string().url().optional().or(z.literal("")),
  pricing: z.object({
    original: z.preprocess(toOptionalNumber, z.number().min(0.01)),
    discounted: optNum,
    deposit: z.preprocess(toOptionalNumber, z.number().min(0.01)),
    currency: z.enum(["USD", "EUR", "GBP"]),
  }),
  travelDates: z.array(z.object({
    // Allow blank rows; incomplete dates are dropped server-side rather than
    // blocking the save. A tour with no valid dates renders "To be announced".
    startDate: z.string(),
    endDate: z.string(),
    tourDays: optNum,
    isAvailable: z.boolean(),
    hasCustomPricing: z.boolean().optional(),
    customOriginal: optNum,
    customDiscounted: optNum,
    customDeposit: optNum,
    hasCustomOriginal: z.boolean().optional(),
    hasCustomDiscounted: z.boolean().optional(),
    hasCustomDeposit: z.boolean().optional(),
  })),
  details: z.object({
    highlights: z.array(z.object({
      text: z.string(),
      image: z.string().optional(),
      subtitle: z.string().optional(),
    })),
    itinerary: z.array(z.object({
      day: z.number(),
      title: z.string(),
      description: z.string(),
      image: z.string().optional(),
      accommodation: z.string().optional(),
      activities: z.string().optional(),
      meals: z.string().optional(),
      details: z.array(z.object({ icon: z.string(), label: z.string(), value: z.string() })).optional(),
    })),
    requirements: z.array(z.string()),
    keyFacts: z.array(z.object({ icon: z.string(), label: z.string(), values: z.array(z.string()) })).optional(),
    tags: z.array(z.object({ label: z.string(), icon: z.string() })).optional(),
    inclusions: z.array(z.object({ icon: z.string().optional(), label: z.string(), value: z.union([z.string(), z.array(z.string())]) })).optional(),
    accommodations: z.array(z.object({ image: z.string(), name: z.string(), nights: z.string() })).optional(),
    faqs: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
    thingsToKnow: z.array(z.object({ icon: z.string().optional(), title: z.string(), description: z.string(), ctaLabel: z.string(), ctaHref: z.string() })).optional(),
    tips: z.array(z.object({ icon: z.string().optional(), title: z.string(), description: z.string() })).optional(),
    reviews: z.array(z.object({
      rating: z.preprocess(toOptionalNumber, z.number().min(1).max(5).default(5)),
      date: z.string(),
      body: z.string(),
      reviewerName: z.string(),
      reviewerLocation: z.string(),
      reviewerAvatar: z.string().optional(),
    })).optional(),
    map: z.object({ image: z.string().optional(), embedUrl: z.string().optional() }).optional(),
  }),
});

// ─── Validation error messaging ─────────────────────────────────────────────
// Turns react-hook-form's nested FieldErrors into a readable, field-named list.

const FIELD_LABELS: Record<string, string> = {
  name: "Tour name", slug: "URL slug", url: "Direct URL", tourCode: "Tour code",
  description: "Description", duration: "Duration", status: "Status",
  stripePaymentLink: "Stripe payment link", brochureLink: "Brochure link",
  preDeparturePack: "Pre-departure pack link",
  "pricing.original": "Original price", "pricing.discounted": "Discounted price",
  "pricing.deposit": "Deposit", "pricing.currency": "Currency",
};
// URL-format fields fail validation only when non-empty and malformed.
const URL_FIELDS = new Set(["url", "stripePaymentLink", "brochureLink", "preDeparturePack"]);
// Fields edited inside the Settings panel — it must be opened before we scroll there.
const PANEL_FIELDS = new Set([
  "status", "slug", "tourCode", "url", "brochureLink", "preDeparturePack",
  "pricing.original", "pricing.discounted", "pricing.deposit", "pricing.currency",
]);
// Friendly names for the repeatable `details.*` / `travelDates` array sections.
const SECTION_LABELS: Record<string, string> = {
  "details.itinerary": "Itinerary", "details.highlights": "Highlight",
  "details.requirements": "Requirement", "details.faqs": "FAQ",
  "details.accommodations": "Accommodation", "details.reviews": "Review",
  "details.tags": "Tag", "details.inclusions": "Inclusion",
  "details.thingsToKnow": "Things to know", "details.tips": "Tip",
  "details.keyFacts": "Key fact", travelDates: "Travel date",
};

const titleCase = (s: string) =>
  s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();

// Walk RHF's nested FieldErrors; a leaf is any node carrying a string `message`.
function collectErrors(node: any, prefix = "", out: { path: string; message: string }[] = []) {
  if (!node || typeof node !== "object") return out;
  if (typeof node.message === "string") { out.push({ path: prefix, message: node.message }); return out; }
  for (const key of Object.keys(node)) {
    if (key === "ref" || key === "type" || key === "message" || key === "root") continue;
    collectErrors(node[key], prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

function labelFor(path: string): string {
  if (FIELD_LABELS[path]) return FIELD_LABELS[path];
  // Array-item paths, e.g. "details.itinerary.0.title" → "Itinerary item 1 — Title".
  const m = path.match(/^(.*?)\.(\d+)(?:\.(.+))?$/);
  if (m) {
    const [, base, idx, field] = m;
    const section = SECTION_LABELS[base] ?? titleCase(base.split(".").pop() ?? base);
    const n = Number(idx) + 1;
    return field ? `${section} item ${n} — ${titleCase(field)}` : `${section} item ${n}`;
  }
  return titleCase(path.split(".").pop() ?? path);
}

const reasonFor = (path: string): string =>
  URL_FIELDS.has(path.split(".")[0]) ? "must be a valid URL" : "is required";

// ─── Icon map (matches www's Icon.tsx) ───────────────────────────────────────

const ICON_COMPONENTS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number | string }>> = {
  days: Calendar, route: Route, people: Users, transport: Bus, airport: Plane,
  accommodation: Hotel, activities: Compass, meals: Utensils, team: HeartHandshake,
  plus: CheckCircle2, location: MapPin, info: Info, faq: HelpCircle, download: Download,
  instagram: Camera, luggage: Luggage, shield: ShieldCheck, sun: Sun, handshake: HeartHandshake,
};

// Tag palette — solid bg colours matching www TourHeader exactly
const TAG_PALETTE = [
  "bg-spring-green text-midnight",
  "bg-vivid-orange text-midnight",
  "bg-sunglow-yellow text-midnight",
  "bg-light-purple text-midnight",
];

const CURRENCY_SYM: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };
const ALL_ICONS = Object.keys(ICON_COMPONENTS);

// ─── Reviews ─────────────────────────────────────────────────────────────────

// Generic reviewer profiles. Double as (a) the greyed-out placeholder cards shown
// when a tour has no reviews and (b) presets the admin can pick to pre-fill a new
// review card. Avatars live in www/public/reviews/avatars and are served from www.
const PLACEHOLDER_REVIEWS = [
  { rating: 5, date: "May 2023", body: "Had an amazing time on the trial tour! Action packed with lots of fun things on the itinerary, and a great bunch of people. Would definitely go again!", reviewerName: "Flynn Deanne", reviewerLocation: "London, United Kingdom", reviewerAvatar: "/reviews/avatars/flynn.jpg" },
  { rating: 5, date: "February 2024", body: "My experience has been amazing, I'll never forget it. I met extraordinary people and explored beautiful places. I definitely recommend to book a trip!", reviewerName: "Manuel Madonna", reviewerLocation: "Milan, Italy", reviewerAvatar: "/reviews/avatars/manuel.jpg" },
  { rating: 5, date: "July 2024", body: "I enjoyed the tour! Seamless coordination of transportation and accommodation made me feel like a VIP throughout the trip! LOVED every bit of it!! I highly recommend!", reviewerName: "Bella Millan", reviewerLocation: "Cagayan, Philippines", reviewerAvatar: "/reviews/avatars/bella.jpg" },
];

// Profiles offered in the "Add review" menu. Selecting one pre-fills the card.
const REVIEW_PRESETS = PLACEHOLDER_REVIEWS;
const BLANK_REVIEW = { rating: 5, date: "", body: "", reviewerName: "", reviewerLocation: "", reviewerAvatar: "" };

// ─── "Things to Know" / "Tips" defaults ────────────────────────────────────────

// Every tour starts with these cards/tips pre-filled (matching what www shows by
// default). They're fully editable per-tour, and "Reset to default" restores them.
const DEFAULT_THINGS_TO_KNOW = [
  {
    icon: "info",
    title: "Travel Information",
    description:
      "Get ready for your trip! Find helpful links to everything you need from travel and health requirements to travel guides, visa information, and more here.",
    ctaLabel: "Show more",
    ctaHref: "https://www.imheretravels.com/travel-information",
  },
  {
    icon: "faq",
    title: "General FAQs",
    description:
      "Have more questions? Check out our FAQs as we might already have the answers.",
    ctaLabel: "Show more",
    ctaHref: "https://www.imheretravels.com/faqs",
  },
];

const DEFAULT_TIPS = [
  {
    icon: "luggage",
    title: "Pack smart",
    description:
      "Bring comfortable walking shoes, quick-dry clothing, a reusable water bottle, and a power adapter suited for your destination.",
  },
  {
    icon: "shield",
    title: "Travel insurance",
    description:
      "We require all travelers to have valid travel insurance covering medical, cancellation, and activity risks for the duration of the trip.",
  },
  {
    icon: "sun",
    title: "Beat the climate",
    description:
      "Sunscreen, a hat, and insect repellent go a long way. Stay hydrated and listen to your body, especially on active days.",
  },
  {
    icon: "handshake",
    title: "Respect local customs",
    description:
      "Dress modestly at temples, learn a few local greetings, and tip where appropriate — small gestures make a big difference.",
  },
];

// Fresh deep copies so editing one tour never mutates the shared default arrays.
const cloneThingsToKnow = () => DEFAULT_THINGS_TO_KNOW.map((c) => ({ ...c }));
const cloneTips = () => DEFAULT_TIPS.map((t) => ({ ...t }));

// ─── New-tour pre-fills ─────────────────────────────────────────────────────────

// Rows every new tour starts with (icon + label fixed; value blank so the template
// shows as a greyed placeholder). Valid icon keys come from ICON_COMPONENTS.
const DEFAULT_KEY_FACTS = [
  { icon: "days", label: "Duration", values: [] as string[] },
  { icon: "location", label: "Destination", values: [] as string[] },
  { icon: "people", label: "Group Size", values: [] as string[] },
];
const DEFAULT_INCLUSIONS = [
  { icon: "meals", label: "Meals", value: "" },
  { icon: "transport", label: "Transport", value: "" },
  { icon: "activities", label: "Activities", value: "" },
  { icon: "accommodation", label: "Accommodation", value: "" },
  { icon: "plus", label: "Others", value: "" },
];
// Meals & Accommodation use structured number-box editors; only Others carries a text
// default. Transport/Activities stay free-form bullets with the generic placeholder.
const INCLUSION_DEFAULTS: Record<string, string> = {
  Others:
    "- 24/7 customer experience assistance\n- Airport and domestic transfer assistance\n- Tour Guide",
};

// Questions every new tour starts with. Tour-specific answers (airports, start/
// finish, local currency) stay blank for the admin to fill; the age policy is a
// company-wide standard, so it's pre-filled.
const DEFAULT_FAQS = [
  { question: "Where does the trip start & finish?", answer: "" },
  { question: "Which airport do I need to fly into?", answer: "" },
  { question: "What should I wear?", answer: "" },
  { question: "Do you have an age limit for tours?", answer: "Most activities suit adventurers 18-45 (typical guests 21-35)." },
  { question: "What is the local currency?", answer: "" },
  { question: "Which airport do I fly out from?", answer: "" },
];

const cloneKeyFacts = () => DEFAULT_KEY_FACTS.map((k) => ({ ...k, values: [] as string[] }));
const cloneInclusions = () => DEFAULT_INCLUSIONS.map((i) => ({ ...i }));
const cloneFaqs = () => DEFAULT_FAQS.map((f) => ({ ...f }));
// Per-day itinerary rows every day starts with (all removable via the existing X button).
const cloneDayDetails = () => [
  { icon: "accommodation", label: "Accommodation", value: "" },
  { icon: "activities", label: "Activity", value: "" },
  { icon: "meals", label: "Meals", value: "" },
];

// ─── Map embed normalization ─────────────────────────────────────────────────────

// Google blocks framing of normal /maps/place share URLs; only /maps/embed or the
// keyless ?output=embed form render in an iframe. Normalize whatever the admin pastes
// (a share link, the @lat,lng URL, or a full <iframe> snippet) into a frameable src.
function toEmbedUrl(raw?: string): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  if (s.includes("<iframe")) {
    const m = s.match(/src=["']([^"']+)["']/i);
    if (m) s = m[1];
  }
  if (s.includes("/maps/embed")) return s;
  const coords =
    s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)(?:,(\d+(?:\.\d+)?)z)?/) ||
    s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (coords) {
    const [, lat, lng, zoom] = coords;
    return `https://maps.google.com/maps?q=${lat},${lng}&z=${zoom ?? 14}&hl=en&output=embed`;
  }
  const place = s.match(/\/maps\/place\/([^/@?]+)/);
  const query = place ? decodeURIComponent(place[1].replace(/\+/g, " ")) : s;
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

// "+ Add review" trigger with a menu to start blank or from a preset profile.
function AddReviewMenu({
  onAdd,
  className,
}: {
  onAdd: (review: typeof BLANK_REVIEW) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`flex items-center gap-1 font-body text-b4-desktop text-crimson-red hover:text-light-red ${className ?? ""}`}
        >
          <Plus className="h-4 w-4" /> Add review
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuItem onClick={() => onAdd({ ...BLANK_REVIEW })}>
          <Plus className="mr-2 h-4 w-4" /> Blank review
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-dark-gray">Use a profile</DropdownMenuLabel>
        {REVIEW_PRESETS.map((preset) => (
          <DropdownMenuItem
            key={preset.reviewerName}
            onClick={() => onAdd({ ...preset })}
            className="gap-3 py-2"
          >
            <span className="size-9 shrink-0 overflow-hidden rounded-full bg-light-grey">
              <img src={resolveImg(preset.reviewerAvatar)} alt="" className="h-full w-full object-cover" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-midnight">{preset.reviewerName}</span>
              <span className="block truncate text-xs text-dark-gray">{preset.reviewerLocation}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StarRatingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="text-lg leading-none focus:outline-none"
          aria-label={`${n} star${n !== 1 ? "s" : ""}`}
        >
          <span className={n <= value ? "text-crimson-red" : "text-light-grey"}>★</span>
        </button>
      ))}
    </div>
  );
}


const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i);

function MonthYearPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const parts = value ? value.split(" ") : [];
  const selectedMonth = parts[0] ?? "";
  const selectedYear = parts[1] ?? "";

  const handleSelect = (month: string, year: string) => {
    if (month && year) { onChange(`${month} ${year}`); setOpen(false); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="font-body text-b5-desktop text-dark-gray hover:text-midnight transition-colors">
          {value || <span className="text-dark-gray/50">Month Year</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 space-y-2" align="end">
        <Select value={selectedMonth} onValueChange={(m) => handleSelect(m, selectedYear || String(CURRENT_YEAR))}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>{MONTHS.map((m) => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={selectedYear} onValueChange={(y) => handleSelect(selectedMonth || MONTHS[0], y)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Year" /></SelectTrigger>
          <SelectContent>{YEARS.map((y) => <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>)}</SelectContent>
        </Select>
      </PopoverContent>
    </Popover>
  );
}

// ─── Inline editing primitives ────────────────────────────────────────────────

/** Input that shrinks/grows to exactly its content width.
 *  A hidden sibling <span> with the same text drives the layout width;
 *  the real <input> is absolutely positioned on top of it. */
function AutoSizeInput({
  value, onChange, placeholder, className = "", compact = false,
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; compact?: boolean }) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current !== document.activeElement) setLocal(value);
  }, [value]);
  const pad = compact ? "" : "px-1";
  return (
    <span className="relative inline-flex min-w-[2ch]">
      {/* Invisible sizer — same font + text as the input */}
      <span className={`invisible whitespace-pre pointer-events-none select-none ${pad} ${className}`} aria-hidden>
        {local || placeholder || " "}
      </span>
      <input
        ref={ref}
        type="text"
        value={local}
        onChange={(e) => {
          const v = e.target.value;
          setLocal(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => onChange(v), 300);
        }}
        onBlur={(e) => { clearTimeout(timer.current); onChange(e.target.value); }}
        placeholder={placeholder}
        className={`absolute inset-0 w-full bg-transparent border-none outline-none
          hover:ring-2 hover:ring-crimson-red/20 focus:ring-2 focus:ring-crimson-red/40
          transition-shadow placeholder:text-dark-gray/30 rounded-sm ${pad} ${className}`}
      />
    </span>
  );
}

/** An input that looks like the rendered content. Local state gives instant display;
 *  debounced onChange batches RHF updates to at most once per 300 ms burst. */
function InlineInput({
  value, onChange, onCommit, placeholder, className = "",
}: { value: string; onChange: (v: string) => void; onCommit?: (v: string) => void; placeholder?: string; className?: string }) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ref = useRef<HTMLInputElement>(null);
  // Keep in sync when the same field is edited elsewhere, unless focused here.
  useEffect(() => {
    if (ref.current !== document.activeElement) setLocal(value);
  }, [value]);
  return (
    <input
      ref={ref}
      type="text"
      value={local}
      onChange={(e) => {
        const v = e.target.value;
        setLocal(v);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onChange(v), 300);
      }}
      onBlur={(e) => { clearTimeout(timer.current); onChange(e.target.value); onCommit?.(e.target.value); }}
      placeholder={placeholder}
      className={`bg-transparent border-none outline-none w-full px-1 -mx-1 rounded-sm
        hover:ring-2 hover:ring-crimson-red/20 focus:ring-2 focus:ring-crimson-red/40 transition-shadow
        placeholder:text-dark-gray/30 ${className}`}
    />
  );
}

/** Auto-growing textarea. Same local-state + debounce pattern as InlineInput. */
function InlineTextarea({
  value, onChange, placeholder, className = "",
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) { ref.current.style.height = "auto"; ref.current.style.height = ref.current.scrollHeight + "px"; }
  }, [local]);
  // Keep in sync when the same field is edited elsewhere, unless focused here.
  useEffect(() => {
    if (ref.current !== document.activeElement) setLocal(value);
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={local}
      onChange={(e) => {
        const v = e.target.value;
        setLocal(v);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onChange(v), 300);
      }}
      onBlur={(e) => { clearTimeout(timer.current); onChange(e.target.value); }}
      placeholder={placeholder}
      rows={1}
      className={`bg-transparent border-none outline-none resize-none overflow-hidden w-full px-1 -mx-1 rounded-sm
        hover:ring-2 hover:ring-crimson-red/20 focus:ring-2 focus:ring-crimson-red/40 transition-shadow
        placeholder:text-dark-gray/30 ${className}`}
    />
  );
}

/**
 * Renders `- item` lines as visual bullet points when idle; switches to a raw
 * textarea on click so the user can edit the `- ` prefix syntax directly.
 */
function InlineBulletTextarea({
  value, onChange, placeholder, className = "", bulleted = false,
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; bulleted?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [editing]);

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={local}
        onChange={(e) => {
          const v = e.target.value;
          setLocal(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => onChange(v), 300);
          if (ref.current) { ref.current.style.height = "auto"; ref.current.style.height = ref.current.scrollHeight + "px"; }
        }}
        onBlur={() => { clearTimeout(timer.current); onChange(local); setEditing(false); }}
        rows={1}
        placeholder={placeholder}
        className={`bg-transparent border-none outline-none resize-none overflow-hidden w-full px-1 -mx-1 rounded-sm
          ring-2 ring-crimson-red/40 transition-shadow placeholder:text-dark-gray/30 ${className}`}
      />
    );
  }

  const lines = local ? local.split("\n").filter(Boolean) : [];
  if (!lines.length) {
    return (
      <p onClick={() => setEditing(true)}
        className={`cursor-text px-1 -mx-1 rounded-sm text-dark-gray/30 hover:ring-2 hover:ring-crimson-red/20 transition-shadow ${className}`}>
        {placeholder}
      </p>
    );
  }

  // For labels www auto-bullets (Activities/Others/Transport), mirror its
  // WhatsIncluded rendering: split on newlines, the • char, and commas, then
  // strip any leading - / * marker — so the preview matches the published page.
  if (bulleted) {
    const bulletItems = local
      .split(/\r?\n|•/g)
      .flatMap((part) => part.split(/\s*,\s*/g))
      .map((part) => part.trim().replace(/^[-*]\s+/, ""))
      .filter(Boolean);
    return (
      <ul onClick={() => setEditing(true)}
        className={`cursor-text list-disc space-y-1 pl-4 marker:text-dark-gray px-1 -mx-1 rounded-sm hover:ring-2 hover:ring-crimson-red/20 transition-shadow ${className}`}>
        {bulletItems.map((v, i) => <li key={i}>{v}</li>)}
      </ul>
    );
  }

  return (
    <div onClick={() => setEditing(true)}
      className={`cursor-text px-1 -mx-1 rounded-sm hover:ring-2 hover:ring-crimson-red/20 transition-shadow ${className}`}>
      {lines.map((line, i) => {
        const isBullet = line.trimStart().startsWith("- ");
        const text = isBullet ? line.trimStart().slice(2) : line;
        return isBullet ? (
          <ul key={i} className="list-disc pl-4 marker:text-dark-gray"><li>{text}</li></ul>
        ) : (
          <p key={i}>{text}</p>
        );
      })}
    </div>
  );
}

/**
 * Itinerary "Meals" editor: clickable Breakfast/Lunch/Dinner chips that compose a
 * human sentence (e.g. "1 Breakfast, 1 Lunch, and 1 Dinner"). The composed text is
 * stored back as the detail's `value` so www renders it verbatim.
 */
const MEAL_OPTIONS = ["Breakfast", "Lunch", "Dinner"] as const;
function composeMeals(selected: string[]): string {
  const items = selected.map((m) => `1 ${m}`);
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
// Connector text between selected meal tokens, mirroring composeMeals (Oxford comma).
function mealConnector(idx: number, total: number): string {
  if (idx === 0) return "";
  if (total === 2) return " and ";
  if (idx === total - 1) return ", and ";
  return ", ";
}
function MealChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const selected = MEAL_OPTIONS.filter((m) => new RegExp(`\\b${m}\\b`, "i").test(value ?? ""));
  const unselected = MEAL_OPTIONS.filter((m) => !selected.includes(m));
  const remove = (m: string) => onChange(composeMeals(selected.filter((x) => x !== m)));
  const add = (m: string) => onChange(composeMeals(MEAL_OPTIONS.filter((x) => selected.includes(x) || x === m)));
  return (
    <div className="mt-0.5 space-y-2">
      {/* Added meals render as the composed sentence; each token removes itself on click */}
      {selected.length > 0 && (
        <p className="flex flex-wrap items-center font-body text-b4-mobile text-dark-gray">
          {selected.map((m, idx) => (
            <span key={m} className="inline-flex items-center whitespace-pre">
              {mealConnector(idx, selected.length)}
              <button
                type="button"
                onClick={() => remove(m)}
                className="group/meal inline-flex items-center gap-0.5 hover:text-crimson-red transition-colors"
              >
                1 {m}
                <X className="h-3 w-3 opacity-0 group-hover/meal:opacity-100 transition-opacity" />
              </button>
            </span>
          ))}
        </p>
      )}
      {/* Remaining options stay as dashed-outline chips until added */}
      {unselected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unselected.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => add(m)}
              className="rounded-full border border-dashed border-crimson-red bg-transparent px-3 py-1 font-body text-b4-mobile text-crimson-red hover:bg-crimson-red/5 transition-colors"
            >
              + 1 {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Structured Key Fact editors ────────────────────────────────────────────────
// These three facts use bespoke inputs instead of free text, composing the same
// single-string value www expects (e.g. "7 Days and 6 nights", "A → B → C",
// "Maximum 20 people"). Local state preserves in-progress/empty boxes between edits.

function NumBox({ value, onChange, ariaLabel }: { value: string; onChange: (v: string) => void; ariaLabel: string }) {
  return (
    <input
      type="number"
      min={0}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="#"
      aria-label={ariaLabel}
      className="w-14 rounded-sm border border-light-grey bg-transparent px-2 py-0.5 text-center font-body text-b2-mobile md:text-b2-desktop text-dark-gray outline-none focus:border-crimson-red transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

function DurationFact({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const m = (value ?? "").match(/(\d+)\s*Days?\s*and\s*(\d+)\s*nights?/i);
  const [days, setDays] = useState(m?.[1] ?? "");
  const [nights, setNights] = useState(m?.[2] ?? "");
  const push = (d: string, n: string) => onChange(d || n ? `${d} Days and ${n} nights` : "");
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 font-body text-b2-mobile md:text-b2-desktop text-dark-gray">
      <NumBox value={days} onChange={(v) => { setDays(v); push(v, nights); }} ariaLabel="Days" />
      <span>Days and</span>
      <NumBox value={nights} onChange={(v) => { setNights(v); push(days, v); }} ariaLabel="Nights" />
      <span>nights</span>
    </div>
  );
}

function GroupSizeFact({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const m = (value ?? "").match(/(\d+)/);
  const [count, setCount] = useState(m?.[1] ?? "");
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 font-body text-b2-mobile md:text-b2-desktop text-dark-gray">
      <span>Maximum</span>
      <NumBox value={count} onChange={(v) => { setCount(v); onChange(v ? `Maximum ${v} people` : ""); }} ariaLabel="Maximum people" />
      <span>people</span>
    </div>
  );
}

function DestinationFact({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const initial = (value ?? "").split("→").map((p) => p.trim()).filter(Boolean);
  const [parts, setParts] = useState<string[]>(initial.length >= 2 ? initial : [...initial, ...Array(2 - initial.length).fill("")]);
  const update = (next: string[]) => { setParts(next); onChange(next.filter((p) => p.trim()).join(" → ")); };
  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 font-body text-b2-mobile md:text-b2-desktop text-dark-gray">
        {parts.map((p, idx) => (
          <span key={idx} className="inline-flex items-center gap-2 group/dest">
            {idx > 0 && <span className="text-dark-gray">→</span>}
            <input
              value={p}
              onChange={(e) => update(parts.map((x, j) => (j === idx ? e.target.value : x)))}
              placeholder={idx === 0 ? "From" : "Destination"}
              className="w-32 rounded-sm border border-light-grey bg-transparent px-2 py-0.5 outline-none focus:border-crimson-red transition-colors placeholder:text-dark-gray/30"
            />
            {parts.length > 2 && (
              <button type="button" onClick={() => update(parts.filter((_, j) => j !== idx))}
                className="text-crimson-red opacity-0 group-hover/dest:opacity-100 transition-opacity">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        ))}
      </div>
      <button type="button" onClick={() => update([...parts, ""])}
        className="flex items-center gap-1 font-body text-b4-desktop text-crimson-red hover:text-light-red">
        <Plus className="h-4 w-4" /> Add destination
      </button>
    </div>
  );
}

// ─── Structured What's Included editors ─────────────────────────────────────────
// Compose the same single-string value www expects (e.g. "6 Breakfasts, 5 Lunches",
// "Hotel (6 nights)").

const MEAL_PLURALS: Record<string, [string, string]> = {
  Breakfast: ["Breakfast", "Breakfasts"],
  Lunch: ["Lunch", "Lunches"],
  Dinner: ["Dinner", "Dinners"],
};
const fmtMeal = (n: string, type: string) => {
  const [s, p] = MEAL_PLURALS[type];
  return `${n} ${n === "1" ? s : p}`;
};

function MealsInclusion({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parse = (type: string) => (value ?? "").match(new RegExp(`(\\d+)\\s*${type}`, "i"))?.[1] ?? "";
  const [b, setB] = useState(() => parse("Breakfast"));
  const [l, setL] = useState(() => parse("Lunch"));
  const [d, setD] = useState(() => parse("Dinner"));
  const [hasL, setHasL] = useState(() => /lunch/i.test(value ?? ""));
  const [hasD, setHasD] = useState(() => /dinner/i.test(value ?? ""));
  const push = (bv: string, lv: string, dv: string, withL: boolean, withD: boolean) => {
    const parts: string[] = [];
    if (bv) parts.push(fmtMeal(bv, "Breakfast"));
    if (withL && lv) parts.push(fmtMeal(lv, "Lunch"));
    if (withD && dv) parts.push(fmtMeal(dv, "Dinner"));
    onChange(parts.join(", "));
  };
  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 font-body text-b4-mobile md:text-b4-desktop text-dark-gray">
        <NumBox value={b} onChange={(v) => { setB(v); push(v, l, d, hasL, hasD); }} ariaLabel="Breakfasts" />
        <span>Breakfasts</span>
        {hasL && (
          <span className="inline-flex items-center gap-2 group/meal">
            <span>,</span>
            <NumBox value={l} onChange={(v) => { setL(v); push(b, v, d, true, hasD); }} ariaLabel="Lunches" />
            <span>Lunches</span>
            <button type="button" onClick={() => { setHasL(false); push(b, l, d, false, hasD); }}
              className="text-crimson-red opacity-0 group-hover/meal:opacity-100 transition-opacity"><X className="h-3.5 w-3.5" /></button>
          </span>
        )}
        {hasD && (
          <span className="inline-flex items-center gap-2 group/meal">
            <span>,</span>
            <NumBox value={d} onChange={(v) => { setD(v); push(b, l, v, hasL, true); }} ariaLabel="Dinners" />
            <span>Dinners</span>
            <button type="button" onClick={() => { setHasD(false); push(b, l, d, hasL, false); }}
              className="text-crimson-red opacity-0 group-hover/meal:opacity-100 transition-opacity"><X className="h-3.5 w-3.5" /></button>
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {!hasL && (
          <button type="button" onClick={() => { setHasL(true); push(b, l, d, true, hasD); }}
            className="rounded-full border border-dashed border-crimson-red bg-transparent px-3 py-1 font-body text-b4-mobile text-crimson-red hover:bg-crimson-red/5 transition-colors">+ Lunches</button>
        )}
        {!hasD && (
          <button type="button" onClick={() => { setHasD(true); push(b, l, d, hasL, true); }}
            className="rounded-full border border-dashed border-crimson-red bg-transparent px-3 py-1 font-body text-b4-mobile text-crimson-red hover:bg-crimson-red/5 transition-colors">+ Dinners</button>
        )}
      </div>
    </div>
  );
}

function AccommodationInclusion({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [nights, setNights] = useState(() => (value ?? "").match(/(\d+)/)?.[1] ?? "");
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 font-body text-b4-mobile md:text-b4-desktop text-dark-gray">
      <span>Hotel (</span>
      <NumBox value={nights} onChange={(v) => { setNights(v); onChange(v ? `Hotel (${v} nights)` : ""); }} ariaLabel="Nights" />
      <span>nights )</span>
    </div>
  );
}

/** "Edit me" wrapper — shows a dashed outline on hover to indicate editability */
function EditZone({ children, label, className = "" }: { children: React.ReactNode; label?: string; className?: string }) {
  return (
    <div className={`relative group/zone ${className}`}>
      {label && (
        <span className="absolute -top-5 left-0 text-[10px] font-body font-bold text-crimson-red uppercase tracking-widest opacity-0 group-hover/zone:opacity-100 transition-opacity pointer-events-none select-none">
          {label}
        </span>
      )}
      <div className="rounded-sm group-hover/zone:ring-2 group-hover/zone:ring-crimson-red/20 transition-shadow">
        {children}
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface TourFormProps {
  onClose: () => void;
  onSubmit: (data: TourFormDataWithStringDates) => Promise<void | string>;
  tour?: TourPackage | null;
  isLoading?: boolean;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TourForm({ onClose, onSubmit, tour, isLoading = false }: TourFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedCover, setUploadedCover] = useState<string | null>(null);
  const [uploadedGallery, setUploadedGallery] = useState<string[]>([]);
  const [coverBlob, setCoverBlob] = useState<File | null>(null);
  const [galleryBlobs, setGalleryBlobs] = useState<File[]>([]);
  const [originalGallery, setOriginalGallery] = useState<string[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [heroPanelOpen, setHeroPanelOpen] = useState(false);
  const [datesModalOpen, setDatesModalOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  // Slug-rename confirmation: set when an existing tour's name changes to a value
  // that yields a different slug. lastPromptedNameRef stops us re-prompting for the
  // same name (e.g. on repeated blurs without further edits).
  const [slugModal, setSlugModal] = useState<{ oldSlug: string; proposedSlug: string } | null>(null);
  const lastPromptedNameRef = useRef<string | null>(null);
  // Itinerary days & FAQs default to open; we track only what the user collapses
  // (empty = all open), so loaded and newly-added entries are expanded by default.
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());
  const [collapsedFaqs, setCollapsedFaqs] = useState<Set<number>>(new Set());
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);

  // Image picker modal state
  type PickerField =
    | "cover"
    | "gallery-add"
    | `gallery-edit-${number}`
    | `highlight-${number}`
    | `accommodation-${number}`
    | `itinerary-${number}`
    | `review-${number}`;
  const [pickerState, setPickerState] = useState<{
    field: PickerField;
    initialUrl?: string;
    multiple?: boolean;
  } | null>(null);

  const hlScrollRef = useRef<HTMLDivElement>(null);
  const accomScrollRef = useRef<HTMLDivElement>(null);
  // Incremented when a tour loads so all InlineInput/InlineTextarea instances remount
  // with fresh initial values (replaces the removed useEffect sync in each primitive).
  const [editorKey, setEditorKey] = useState(0);

  const form = useForm<any>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", slug: "", url: "", tourCode: "", description: "",
      duration: "1 days", cardHeaderTitle: "11 Day Tour", cardSubHeader: "Destination", status: "draft",
      scheduledPublishAt: "",
      comingSoon: false, isHosted: false, bookingSlug: "", previousSlugs: [], seo: { title: "", description: "" },
      destinations: [],
      stripePaymentLink: "", depositNote: "", footnote: "",
      brochureLink: "", preDeparturePack: "",
      pricing: { original: undefined, discounted: undefined, deposit: undefined, currency: "GBP" },
      travelDates: [{ startDate: "", endDate: "", isAvailable: true, hasCustomPricing: false,
        customOriginal: undefined, customDiscounted: undefined, customDeposit: undefined,
        hasCustomOriginal: false, hasCustomDiscounted: false, hasCustomDeposit: false }],
      details: {
        highlights: [{ text: "", image: undefined, subtitle: undefined }],
        itinerary: [{ day: 1, title: "", description: "", image: undefined, accommodation: undefined, activities: undefined, meals: undefined, details: cloneDayDetails() }],
        requirements: [""],
        keyFacts: cloneKeyFacts(), tags: [], inclusions: cloneInclusions(), accommodations: [], faqs: cloneFaqs(),
        thingsToKnow: cloneThingsToKnow(), tips: cloneTips(), reviews: [], map: { image: "", embedUrl: "" },
      },
    },
  });

  const w = form.watch;
  const sv = (n: string, v: any) => form.setValue(n as any, v);
  const gv = (n: string) => form.getValues(n as any);

  // Smooth-scroll to a field by its `data-field` anchor and briefly flash it.
  const scrollToField = (path: string) => {
    const el = document.querySelector<HTMLElement>(`[data-field="${path}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-crimson-red", "rounded-md");
    setTimeout(() => el.classList.remove("ring-2", "ring-crimson-red", "rounded-md"), 1500);
  };

  // Shared invalid-submit handler for both Save buttons — names each failing
  // field instead of the old generic "check required fields" message.
  const onInvalid = (errs: any) => {
    console.error("Form validation errors:", errs);
    const items = collectErrors(errs);
    const labels = items.map((i) => `${labelFor(i.path)} ${reasonFor(i.path)}`);
    const shown = labels.slice(0, 8);
    toast({
      title: "Please complete required fields",
      description: labels.length ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {shown.map((l, i) => <li key={i}>{l}</li>)}
          {labels.length > shown.length && <li>+{labels.length - shown.length} more…</li>}
        </ul>
      ) : (
        "Some fields need attention. Please review and try again."
      ),
      variant: "destructive",
    });
    const first = items[0]?.path;
    if (first) {
      if (PANEL_FIELDS.has(first)) setPanelOpen(true);
      // Two frames: let the panel mount (when just opened) before scrolling.
      requestAnimationFrame(() => requestAnimationFrame(() => scrollToField(first)));
    }
  };

  // Field arrays
  const { fields: tagFields, append: addTag, remove: rmTag, move: moveTag } = useFieldArray({ control: form.control, name: "details.tags" });
  const { fields: inclFields, append: addIncl, remove: rmIncl, move: moveIncl } = useFieldArray({ control: form.control, name: "details.inclusions" });
  const { fields: hlFields, append: addHl, remove: rmHl, move: moveHl } = useFieldArray({ control: form.control, name: "details.highlights" as any });
  const { fields: iterFields, append: addIter, remove: rmIter, move: moveIter } = useFieldArray({ control: form.control, name: "details.itinerary" });
  const { fields: accomFields, append: addAccom, remove: rmAccom, move: moveAccom } = useFieldArray({ control: form.control, name: "details.accommodations" });
  const { fields: faqFields, append: addFaq, remove: rmFaq, move: moveFaq } = useFieldArray({ control: form.control, name: "details.faqs" });
  const { fields: ttkFields, append: addTtk, remove: rmTtk, move: moveTtk, replace: replaceTtk } = useFieldArray({ control: form.control, name: "details.thingsToKnow" });
  const { fields: tipFields, append: addTip, remove: rmTip, move: moveTip, replace: replaceTip } = useFieldArray({ control: form.control, name: "details.tips" });
  const { fields: reviewFields, append: addReview, remove: rmReview, move: moveReview } = useFieldArray({ control: form.control, name: "details.reviews" as any });
  const { fields: reqFields, append: addReq, remove: rmReq } = useFieldArray({ control: form.control, name: "details.requirements" as any });
  const { fields: dateFields, append: addDate, remove: rmDate } = useFieldArray({ control: form.control, name: "travelDates" });
  const { fields: kfFields, append: addKf, remove: rmKf, move: moveKf } = useFieldArray({ control: form.control, name: "details.keyFacts" as any });

  // Watched values — only fields used for conditional rendering, computed values, or structural display
  const name = w("name") as string;          // toolbar display + slug auto-gen
  const slug = (w("slug") as string) || (tour?.slug ?? "");
  const previewUrl = (w("url") as string) || (slug ? `https://imheretravels.com/all-tours/${slug}` : null);
  const duration = w("duration") as string;  // durationLabel computed value
  const cardHeaderTitle = w("cardHeaderTitle") as string;
  const cardSubHeader = w("cardSubHeader") as string;
  const pricing = w("pricing");              // booking card live preview
  const tags = w("details.tags") as Array<{ label: string; icon: string }> | undefined;
  const inclusions = w("details.inclusions") as any[] | undefined;
  const highlights = w("details.highlights") as any[] | undefined;
  const itinerary = w("details.itinerary") as any[] | undefined;
  const accoms = w("details.accommodations") as any[] | undefined;
  const faqs = w("details.faqs") as any[] | undefined;
  const ttks = w("details.thingsToKnow") as any[] | undefined;
  const tips = w("details.tips") as any[] | undefined;
  const reviews = w("details.reviews") as any[] | undefined;
  const kfData = w("details.keyFacts") as Array<{ icon: string; label: string; values: string[] }> | undefined;
  const travelDates = w("travelDates") as any[] | undefined; // Tour Dates key-fact display
  const mapData = w("details.map") as any;   // conditional render of map section
  const status = w("status") as string;      // conditional section rendering

  // Memoised computed values — only recalculate when their inputs change
  const sym = useMemo(() => CURRENCY_SYM[pricing?.currency ?? "GBP"] ?? "£", [pricing?.currency]);
  const displayPrice = useMemo(() => pricing?.discounted
    ? `${sym}${Number(pricing.discounted).toLocaleString()}`
    : pricing?.original
    ? `${sym}${Number(pricing.original).toLocaleString()}`
    : `${sym}—`, [pricing, sym]);
  const depositAmt = useMemo(() => pricing?.deposit ? `${sym}${Number(pricing.deposit).toLocaleString()}` : null, [pricing, sym]);
  const durationLabel = useMemo(() => duration
    ? duration.replace(/\b(\d+)\s+days?\b/gi, "$1 Day Tour")
    : "", [duration]);

  // Derived "Tour Dates" key fact — available date ranges formatted like www.
  // Computed inline (not memoised): react-hook-form mutates the travelDates
  // array in place, so a [travelDates]-keyed memo would go stale on edits.
  // `toDateValue` handles ISO strings, Timestamps, and Date objects alike.
  const dateRangeFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const tourDateValues = (travelDates ?? [])
    .filter((d) => d?.isAvailable !== false)
    .map((d) => {
      const ds = toDateValue(d?.startDate);
      const de = toDateValue(d?.endDate);
      return ds && de ? `${dateRangeFmt.format(ds)} – ${dateRangeFmt.format(de)}` : null;
    })
    .filter(Boolean) as string[];

  // Auto-slug
  useEffect(() => { if (name && !tour) sv("slug", generateSlug(name)); }, [name]);

  // On rename of an existing tour, offer to update the (now-stale) URL slug and log
  // the old one as a redirect. Fires when the name field commits (blur). The
  // create flow uses the auto-slug effect above, so this is edit-only.
  const handleNameCommit = (committed: string) => {
    const newName = committed.trim();
    if (!tour || !newName) return;
    const currentSlug = (form.getValues("slug") as string) || "";
    const proposed = generateSlug(newName);
    if (proposed && proposed !== currentSlug && newName !== lastPromptedNameRef.current) {
      lastPromptedNameRef.current = newName;
      setSlugModal({ oldSlug: currentSlug, proposedSlug: proposed });
    }
  };

  const confirmSlugChange = (finalSlug: string, redirectOld: boolean) => {
    const oldSlug = slugModal?.oldSlug ?? "";
    sv("slug", finalSlug);
    if (oldSlug && oldSlug !== finalSlug) {
      const prev = (form.getValues("previousSlugs") as { slug: string; redirect: boolean }[]) ?? [];
      sv("previousSlugs", [...prev.filter((p) => p.slug !== oldSlug), { slug: oldSlug, redirect: redirectOld }]);
    }
    setSlugModal(null);
  };

  // Populate from existing tour
  useEffect(() => {
    if (tour) {
      const travelDates = tour.travelDates?.map((td) => {
        const s = toIso(td.startDate), e = toIso(td.endDate);
        let days = td.tourDays;
        if (!days && s && e) days = Math.ceil((new Date(e).getTime() - new Date(s).getTime()) / 86400000) + 1;
        return { startDate: s, endDate: e, tourDays: days, isAvailable: td.isAvailable,
          hasCustomPricing: !!(td.customOriginal ?? td.customDiscounted ?? td.customDeposit),
          customOriginal: td.customOriginal, customDiscounted: td.customDiscounted, customDeposit: td.customDeposit,
          hasCustomOriginal: td.hasCustomOriginal ?? td.customOriginal !== undefined,
          hasCustomDiscounted: td.hasCustomDiscounted ?? td.customDiscounted !== undefined,
          hasCustomDeposit: td.hasCustomDeposit ?? td.customDeposit !== undefined };
      }) ?? [{ startDate: "", endDate: "", isAvailable: true, hasCustomPricing: false,
               customOriginal: undefined, customDiscounted: undefined, customDeposit: undefined,
               hasCustomOriginal: false, hasCustomDiscounted: false, hasCustomDeposit: false }];

      const highlights = (tour.details?.highlights?.filter(Boolean) ?? [{ text: "", image: undefined, subtitle: undefined }]).map((h: any) =>
        typeof h === "string" ? { text: h, image: undefined, subtitle: undefined }
          : { text: h.text ?? "", image: h.image, subtitle: h.subtitle });

      const itinerary = (tour.details?.itinerary?.filter(Boolean) ?? [{ day: 1, title: "", description: "" }]).map((d: any) => ({
        day: d.day, title: d.title ?? "", description: d.description ?? "",
        image: d.image, accommodation: d.accommodation, activities: d.activities, meals: d.meals,
        details: d.details ?? [] }));

      const d = tour.details as any;
      form.reset({
        name: tour.name || "", slug: tour.slug || "", url: tour.url ?? "",
        tourCode: tour.tourCode || "", description: tour.description || "",
        duration: tour.duration || "1 days",
        cardHeaderTitle: (tour as any).cardHeaderTitle ?? (tour.duration ? tour.duration.replace(/\b(\d+)\s+days?\b/gi, "$1 Day Tour") : ""),
        cardSubHeader: (tour as any).cardSubHeader ?? (tour as any).destinations?.[0] ?? "",
        status: tour.status || "draft",
        scheduledPublishAt: dateToManilaLocalInput((tour as any).scheduledPublishAt),
        comingSoon: (tour as any).comingSoon ?? false, isHosted: (tour as any).isHosted ?? false, bookingSlug: (tour as any).bookingSlug ?? "",
        previousSlugs: (tour as any).previousSlugs ?? [],
        seo: (tour as any).seo ?? { title: "", description: "" },
        destinations: (tour as any).destinations ?? [],
        stripePaymentLink: tour.stripePaymentLink ?? "", depositNote: (tour as any).depositNote ?? "",
        footnote: (tour as any).footnote ?? "", brochureLink: tour.brochureLink ?? "",
        preDeparturePack: tour.preDeparturePack ?? "",
        pricing: tour.pricing ? {
          original: tour.pricing.original ?? undefined, discounted: tour.pricing.discounted ?? undefined,
          deposit: tour.pricing.deposit ?? undefined, currency: tour.pricing.currency || "GBP",
        } : { original: undefined, discounted: undefined, deposit: undefined, currency: "GBP" },
        travelDates,
        details: {
          highlights, itinerary,
          requirements: tour.details?.requirements?.filter(Boolean) ?? [""],
          keyFacts: d?.keyFacts ?? [], tags: d?.tags ?? [], inclusions: d?.inclusions ?? [],
          accommodations: d?.accommodations ?? [], faqs: d?.faqs ?? [],
          // Pre-fill with the defaults when a tour has none saved, so every tour
          // shows the standard cards/tips (still editable + resettable per tour).
          thingsToKnow: d?.thingsToKnow?.length ? d.thingsToKnow : cloneThingsToKnow(),
          tips: d?.tips?.length ? d.tips : cloneTips(),
          map: d?.map ?? { image: "", embedUrl: "" },
        },
      });
      setUploadedCover(tour.media?.coverImage || null);
      setUploadedGallery(tour.media?.gallery || []);
      setOriginalGallery(tour.media?.gallery || []);
      setCoverBlob(null); setGalleryBlobs([]);
      setEditorKey(k => k + 1); // remount all InlineInput/InlineTextarea with fresh values
    }
  }, [tour, form]);

  // ── Media handlers ──────────────────────────────────────────────────────────
  const rmGallery = (i: number) => {
    if (uploadedGallery[i]?.startsWith("blob:")) revokeBlobUrl(uploadedGallery[i]);
    setUploadedGallery((p) => p.filter((_, j) => j !== i));
    setGalleryBlobs((p) => p.filter((_, j) => j !== i));
  };

  // Reorder gallery thumbnails (drag-and-drop). Keeps the parallel blob array in
  // lockstep when present and remaps the active-thumb index to follow the move.
  const moveGallery = (from: number, to: number) => {
    const reorder = <T,>(arr: T[]): T[] => {
      const next = arr.slice();
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    };
    const len = uploadedGallery.length;
    setUploadedGallery((p) => reorder(p));
    setGalleryBlobs((p) => (p.length === len ? reorder(p) : p));
    setActiveGalleryIndex((idx) => {
      if (idx === from) return to;
      if (from < idx && to >= idx) return idx - 1;
      if (from > idx && to <= idx) return idx + 1;
      return idx;
    });
  };

  // Called when the user confirms an image (or images) in the picker modal.
  // Routes the result URL(s) to the correct form field based on which picker was opened.
  const handlePickerConfirm = (urls: string[]) => {
    if (!pickerState) return;
    const { field, initialUrl } = pickerState;

    if (field === "cover") {
      setUploadedCover(urls[0] ?? null);
    } else if (field === "gallery-add") {
      setUploadedGallery((prev) => [...prev, ...urls]);
    } else if (field.startsWith("gallery-edit-")) {
      const idx = Number(field.replace("gallery-edit-", ""));
      if (initialUrl) {
        setUploadedGallery((prev) => prev.map((u, j) => (j === idx ? (urls[0] ?? u) : u)));
      }
    } else if (field.startsWith("highlight-")) {
      const i = Number(field.replace("highlight-", ""));
      const hl = (form.getValues as any)(`details.highlights.${i}`);
      sv(`details.highlights.${i}`, { ...hl, image: urls[0] });
    } else if (field.startsWith("accommodation-")) {
      const i = Number(field.replace("accommodation-", ""));
      sv(`details.accommodations.${i}.image`, urls[0]);
    } else if (field.startsWith("itinerary-")) {
      const i = Number(field.replace("itinerary-", ""));
      sv(`details.itinerary.${i}.image`, urls[0]);
    } else if (field.startsWith("review-")) {
      const i = Number(field.replace("review-", ""));
      sv(`details.reviews.${i}.reviewerAvatar`, urls[0]);
    }

    setPickerState(null);
  };

  // ── Undo / redo / reset history ───────────────────────────────────────────────
  // Whole-form snapshots: react-hook-form values (serializable) plus the cover/
  // gallery media state the picker writes outside RHF. coverBlob/galleryBlobs are
  // the legacy direct-File path (normally empty with the picker flow) and are not
  // snapshotted. Restore = form.reset + media setState + editorKey bump (remounts
  // the inline editors so they re-read the restored values).
  type TourSnapshot = { values: any; cover: string | null; gallery: string[]; activeIdx: number };

  const history = useUndoRedo<TourSnapshot>({
    getSnapshot: () => ({
      values: structuredClone(form.getValues()),
      cover: uploadedCover,
      gallery: [...uploadedGallery],
      activeIdx: activeGalleryIndex,
    }),
    applySnapshot: (s) => {
      // Clone on apply too — RHF mutates arrays in place, which would otherwise
      // corrupt the stored history entry.
      form.reset(structuredClone(s.values));
      setUploadedCover(s.cover);
      setUploadedGallery([...s.gallery]);
      setActiveGalleryIndex(s.activeIdx);
      setEditorKey((k) => k + 1);
    },
  });

  // Warn before navigating away with unsaved edits (links, browser back,
  // refresh/close, and the in-form "Back to Tours" button).
  const leaveGuard = useUnsavedChangesGuard({ isDirty: history.isDirty, onLeave: onClose });

  // Record on any RHF change (text, reorder, add/remove, image setValue).
  useEffect(() => {
    const sub = form.watch(() => history.record());
    return () => sub.unsubscribe();
  }, [form, history.record]);

  // Record on cover/gallery changes (written outside RHF by the picker).
  useEffect(() => {
    history.record();
  }, [uploadedCover, uploadedGallery, activeGalleryIndex, history.record]);

  // Establish the baseline once a tour has loaded (deferred so the just-set form
  // and media state are readable). Reset reverts here; the load isn't an undo step.
  useEffect(() => {
    const raf = requestAnimationFrame(() => history.rebase());
    return () => cancelAnimationFrame(raf);
  }, [tour?.id, history.rebase]);

  // Keyboard shortcuts — skip while typing so the browser's native text undo wins.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing || !(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) { e.preventDefault(); history.undo(); }
      else if ((key === "z" && e.shiftKey) || key === "y") { e.preventDefault(); history.redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history.undo, history.redo]);

  const handleResetConfirm = () => {
    history.reset();
    setResetOpen(false);
    toast({ title: "Changes discarded", description: "The tour was reverted to its last saved state." });
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    // Force the scheduled-publish value into the payload. It's an unregistered
    // `.nullish()` field, so RHF + the zod resolver can drop it from `data`
    // (undefined → stripped by JSON.stringify), which would leave the Firestore
    // field unwritten. Read it straight from form state so it's always sent
    // (empty string clears it server-side).
    data.scheduledPublishAt = form.getValues("scheduledPublishAt") ?? "";
    // On create, blank pre-filled What's Included rows fall back to their template
    // default. Typed values win; rows the admin cleared/removed are respected. (Key Facts
    // use structured editors that compose their own value, so they need no fallback.)
    if (!tour) {
      for (const inc of data?.details?.inclusions ?? []) {
        const def = INCLUSION_DEFAULTS[inc.label];
        const blank = Array.isArray(inc.value) ? !inc.value.length : !String(inc.value ?? "").trim();
        if (def && blank) inc.value = def;
      }
    }
    try {
      if (tour) {
        await onSubmit(data);

        // Upload any legacy blob files (fallback; normally empty with the picker flow)
        let finalCover = uploadedCover && !uploadedCover.startsWith("blob:") ? uploadedCover : null;
        let finalGallery = uploadedGallery.filter((u) => !u.startsWith("blob:"));

        if (coverBlob || galleryBlobs.length > 0) {
          const r = await uploadAllBlobsToStorage(coverBlob, galleryBlobs, tour.id);
          if (r.coverResult?.success) finalCover = r.coverResult.url ?? null;
          const blobUrls = r.galleryResults?.filter((x) => x.success).map((x) => x.url!) ?? [];
          if (blobUrls.length) finalGallery = [...finalGallery, ...blobUrls];
        }

        const mu: any = {};
        if (finalCover) mu.coverImage = finalCover;
        if (finalGallery.length || originalGallery.length) {
          mu.gallery = finalGallery;
          await cleanupRemovedGalleryImages(originalGallery, finalGallery);
        }
        if (Object.keys(mu).length) await updateTourMedia(tour.id, mu);
        toast({ title: "Saved", description: "Tour updated successfully." });
      } else {
        const id = await onSubmit(data);
        const tourId = typeof id === "string" ? id : "";
        if (tourId) {
          let finalCover = uploadedCover && !uploadedCover.startsWith("blob:") ? uploadedCover : null;
          let finalGallery = uploadedGallery.filter((u) => !u.startsWith("blob:"));

          if (coverBlob || galleryBlobs.length > 0) {
            const r = await uploadAllBlobsToStorage(coverBlob, galleryBlobs, tourId);
            if (r.coverResult?.success) finalCover = r.coverResult.url ?? null;
            const urls = r.galleryResults?.filter((x) => x.success).map((x) => x.url!) ?? [];
            if (urls.length) finalGallery = [...finalGallery, ...urls];
          }

          const mu: any = {};
          if (finalCover) mu.coverImage = finalCover;
          if (finalGallery.length) mu.gallery = finalGallery;
          if (Object.keys(mu).length) await updateTourMedia(tourId, mu);
        }
        toast({ title: "Created", description: "New tour package created." });
      }
      cleanupBlobUrls([...uploadedGallery, ...(uploadedCover ? [uploadedCover] : [])]);
      // Make the saved state the new baseline so "Reset" reverts to it.
      requestAnimationFrame(() => history.rebase());
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to save tour.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div key={editorKey} className="min-h-screen bg-light-grey">
      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-100 bg-white/80 backdrop-blur-sm flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-crimson-red border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Editor toolbar ─────────────────────────────────────────────────── */}
      {/* Mobile nav scrolls with page; desktop navbar is sticky h-16 — sit flush on mobile, below navbar on desktop */}
      <div className="sticky top-0 lg:top-16 z-30 bg-white border-b border-light-grey shadow-xsmall">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          {/* Main row */}
          <div className="h-12 md:h-14 flex items-center justify-between gap-2 md:gap-4">
            <button
              type="button"
              onClick={() => leaveGuard.requestNav(onClose)}
              className="flex items-center gap-2 font-body text-b4-desktop text-dark-gray hover:text-midnight transition-colors shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Tours</span>
            </button>

            {/* Desktop: all controls in one row */}
            <div className="hidden md:flex items-center gap-3">
              {/* Status badge */}
              <Select value={w("status")} onValueChange={(v) => sv("status", v)}>
                <SelectTrigger className="h-8 text-xs border-border w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>

              {/* Schedule publish */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title="Schedule publish"
                    className={`flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs transition-colors ${
                      w("scheduledPublishAt")
                        ? "border-vivid-orange text-vivid-orange bg-vivid-orange/10"
                        : "border-border text-dark-gray hover:bg-light-grey"
                    }`}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">
                      {w("scheduledPublishAt") ? "Scheduled" : "Schedule"}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3 space-y-2" align="end">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-midnight">
                      Schedule publish
                    </p>
                    <p className="text-[11px] text-dark-gray leading-snug">
                      The tour automatically switches to{" "}
                      <span className="font-medium">Active</span> at this date
                      &amp; time (<span className="font-medium">Manila / PHT</span>
                      ). Leave it as Draft or Archived until then.
                    </p>
                  </div>
                  <input
                    type="datetime-local"
                    value={w("scheduledPublishAt") ?? ""}
                    onChange={(e) => sv("scheduledPublishAt", e.target.value)}
                    className="w-full h-9 rounded-md border border-border bg-white px-2 text-xs text-midnight focus:outline-none focus:ring-2 focus:ring-crimson-red/30"
                  />
                  {w("scheduledPublishAt") && (
                    <div className="flex items-center justify-between pt-0.5">
                      {w("status") === "active" && (
                        <span className="text-[11px] text-amber-600">
                          Already Active — schedule has no effect.
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => sv("scheduledPublishAt", "")}
                        className="ml-auto text-[11px] text-crimson-red hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              {/* Coming soon toggle */}
              <div className="flex items-center gap-1.5 text-xs text-dark-gray">
                <Switch
                  checked={w("comingSoon") ?? false}
                  onCheckedChange={(v) => sv("comingSoon", v)}
                  className="scale-75 data-[state=checked]:bg-vivid-orange"
                />
                <span>Coming Soon</span>
              </div>

              {/* Undo / redo / reset */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => history.undo()}
                  disabled={!history.canUndo}
                  title="Undo (Ctrl+Z)"
                  aria-label="Undo"
                  className="flex items-center justify-center h-9 w-9 rounded-full border border-border text-midnight hover:bg-light-grey disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => history.redo()}
                  disabled={!history.canRedo}
                  title="Redo (Ctrl+Shift+Z)"
                  aria-label="Redo"
                  className="flex items-center justify-center h-9 w-9 rounded-full border border-border text-midnight hover:bg-light-grey disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Redo2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setResetOpen(true)}
                  disabled={!history.canUndo && !history.canRedo}
                  title="Discard all changes"
                  aria-label="Discard all changes"
                  className="flex items-center justify-center h-9 w-9 rounded-full border border-border text-midnight hover:bg-light-grey hover:text-crimson-red disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setHeroPanelOpen(p => !p)}
                className={`flex items-center gap-1.5 h-9 px-4 rounded-full border font-body text-sm transition-colors ${heroPanelOpen ? "border-crimson-red bg-crimson-red/5 text-crimson-red" : "border-border text-midnight hover:bg-light-grey"}`}
              >
                <ImageIcon className="h-4 w-4" />
                Hero
              </button>

              <button
                type="button"
                onClick={() => setPanelOpen(p => !p)}
                className={`flex items-center gap-1.5 h-9 px-4 rounded-full border font-body text-sm transition-colors ${panelOpen ? "border-crimson-red bg-crimson-red/5 text-crimson-red" : "border-border text-midnight hover:bg-light-grey"}`}
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>

              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Preview on website"
                  className="flex items-center gap-1.5 h-9 px-4 rounded-full border border-border text-midnight hover:bg-light-grey font-body text-sm transition-colors"
                >
                  <Eye className="h-4 w-4" />
                  Preview
                </a>
              )}

              <Button
                type="button"
                disabled={isSubmitting}
                onClick={form.handleSubmit(handleSubmit, onInvalid)}
                className="h-9 bg-crimson-red hover:bg-light-red text-white rounded-full px-5 font-body font-bold text-sm shadow-small"
              >
                <Save className="h-4 w-4 mr-1.5" />
                {isSubmitting ? "Saving…" : tour ? "Save Changes" : "Create Tour"}
              </Button>
            </div>

            {/* Mobile: status + save only */}
            <div className="flex md:hidden items-center gap-2">
              <Select value={w("status")} onValueChange={(v) => sv("status", v)}>
                <SelectTrigger className="h-8 text-xs border-border w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={form.handleSubmit(handleSubmit, onInvalid)}
                className="h-8 bg-crimson-red hover:bg-light-red text-white rounded-full px-4 font-body font-bold text-sm shadow-small"
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                {isSubmitting ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          {/* Secondary row — mobile only: Coming Soon + Undo/Redo/Reset + Settings */}
          <div className="flex md:hidden items-center justify-between gap-2 pb-2 border-t border-border/30 pt-1.5">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-dark-gray">
                <Switch
                  checked={w("comingSoon") ?? false}
                  onCheckedChange={(v) => sv("comingSoon", v)}
                  className="scale-75 data-[state=checked]:bg-vivid-orange"
                />
                <span>Coming Soon</span>
              </div>

              {/* Schedule publish (mobile) */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title="Schedule publish"
                    className={`flex items-center gap-1 h-7 px-2 rounded-md border text-xs transition-colors ${
                      w("scheduledPublishAt")
                        ? "border-vivid-orange text-vivid-orange bg-vivid-orange/10"
                        : "border-border text-dark-gray"
                    }`}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    <span>
                      {w("scheduledPublishAt") ? "Scheduled" : "Schedule"}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3 space-y-2" align="start">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-midnight">
                      Schedule publish
                    </p>
                    <p className="text-[11px] text-dark-gray leading-snug">
                      The tour automatically switches to{" "}
                      <span className="font-medium">Active</span> at this date
                      &amp; time (<span className="font-medium">Manila / PHT</span>
                      ).
                    </p>
                  </div>
                  <input
                    type="datetime-local"
                    value={w("scheduledPublishAt") ?? ""}
                    onChange={(e) => sv("scheduledPublishAt", e.target.value)}
                    className="w-full h-9 rounded-md border border-border bg-white px-2 text-xs text-midnight focus:outline-none focus:ring-2 focus:ring-crimson-red/30"
                  />
                  {w("scheduledPublishAt") && (
                    <button
                      type="button"
                      onClick={() => sv("scheduledPublishAt", "")}
                      className="block ml-auto text-[11px] text-crimson-red hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => history.undo()}
                disabled={!history.canUndo}
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
                className="flex items-center justify-center h-8 w-8 rounded-full border border-border text-midnight hover:bg-light-grey disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => history.redo()}
                disabled={!history.canRedo}
                title="Redo (Ctrl+Shift+Z)"
                aria-label="Redo"
                className="flex items-center justify-center h-8 w-8 rounded-full border border-border text-midnight hover:bg-light-grey disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setResetOpen(true)}
                disabled={!history.canUndo && !history.canRedo}
                title="Discard all changes"
                aria-label="Discard all changes"
                className="flex items-center justify-center h-8 w-8 rounded-full border border-border text-midnight hover:bg-light-grey hover:text-crimson-red disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setHeroPanelOpen(p => !p)}
                aria-label="Hero"
                className={`flex items-center justify-center h-8 w-8 rounded-full border font-body transition-colors ${heroPanelOpen ? "border-crimson-red bg-crimson-red/5 text-crimson-red" : "border-border text-midnight hover:bg-light-grey"}`}
              >
                <ImageIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPanelOpen(p => !p)}
                aria-label="Settings"
                className={`flex items-center justify-center h-8 w-8 rounded-full border font-body transition-colors ${panelOpen ? "border-crimson-red bg-crimson-red/5 text-crimson-red" : "border-border text-midnight hover:bg-light-grey"}`}
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Preview on website"
                  className="flex items-center justify-center h-8 w-8 rounded-full border border-border text-midnight hover:bg-light-grey transition-colors"
                >
                  <Eye className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit, (errs) => { console.error("Form validation errors:", errs); })}>
          {/* ── Page container (matches www max-w-7xl) ────────────────────── */}
          <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 flex flex-col">

            {/* Breadcrumbs */}
            <nav className="flex items-center gap-2 font-body text-b4-desktop text-dark-gray mb-4">
              <span>Home</span><span>/</span><span>Tours</span><span>/</span>
              <span className="text-midnight font-bold truncate max-w-xs">{name || "New Tour"}</span>
            </nav>

            {/* H1 — editable tour name */}
            <EditZone label="Tour Name" className="mb-4">
              <InlineInput
                value={name}
                onChange={(v) => sv("name", v)}
                onCommit={handleNameCommit}
                placeholder="Tour Name"
                className="font-display text-h4-mobile md:text-h1-desktop font-bold text-midnight"
              />
            </EditZone>

            {/* ── Two-column grid ───────────────────────────────────────── */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] lg:gap-8">

              {/* ─── LEFT COLUMN ─────────────────────────────────────────── */}
              <div className="min-w-0">

                {/* Gallery — outside main card, same as www */}
                {(() => {
                  const galleryImages = uploadedGallery.filter(Boolean) as string[];
                  // Header carousel shows gallery images only — the hero/cover lives in its
                  // own "Hero" panel (toolbar) so adding header images never hides it.
                  const safeIdx = galleryImages.length ? Math.min(activeGalleryIndex, galleryImages.length - 1) : 0;
                  const activeImg = galleryImages[safeIdx];
                  return (
                    <div id="section-gallery">
                      <div className="relative aspect-4/3 md:aspect-video w-full overflow-hidden rounded-3xl bg-light-grey group/hero">
                        {activeImg ? (
                          <img src={resolveImg(activeImg)} alt={`Header ${safeIdx + 1}`} className="w-full h-full object-cover" />
                        ) : (
                          <button type="button" onClick={() => setPickerState({ field: "gallery-add", multiple: true })}
                            className="flex flex-col items-center justify-center h-full w-full cursor-pointer hover:bg-light-grey/80 transition-colors">
                            <ImageIcon className="h-10 w-10 text-dark-gray/40 mb-2" />
                            <span className="font-body text-b4-desktop text-dark-gray">Click to add header image</span>
                          </button>
                        )}
                        {activeImg && (
                          <div className="absolute inset-0 bg-black/0 group-hover/hero:bg-black/30 transition-colors flex items-center justify-center">
                            <div className="opacity-0 group-hover/hero:opacity-100 transition-opacity flex gap-2">
                              <button type="button" onClick={() => setPickerState({ field: `gallery-edit-${safeIdx}`, initialUrl: resolveImg(activeImg) || undefined })}
                                className="flex size-10 items-center justify-center bg-white text-midnight rounded-full shadow-small hover:shadow-medium hover:text-crimson-red transition-colors cursor-pointer">
                                <Camera className="h-5 w-5" />
                              </button>
                              <button type="button" onClick={() => { rmGallery(safeIdx); setActiveGalleryIndex(0); }}
                                className="flex items-center gap-1 bg-crimson-red text-white rounded-full px-3 py-2 text-sm font-body cursor-pointer shadow-small">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        )}
                        {galleryImages.length > 1 && (
                          <>
                            <button type="button" onClick={() => setActiveGalleryIndex(i => (i - 1 + galleryImages.length) % galleryImages.length)}
                              className="absolute left-3 top-1/2 -translate-y-1/2 size-10 rounded-full bg-white/90 shadow-small flex items-center justify-center hover:bg-white transition-colors">
                              <ChevronLeft className="h-5 w-5 text-midnight" />
                            </button>
                            <button type="button" onClick={() => setActiveGalleryIndex(i => (i + 1) % galleryImages.length)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 size-10 rounded-full bg-white/90 shadow-small flex items-center justify-center hover:bg-white transition-colors">
                              <ChevronRight className="h-5 w-5 text-midnight" />
                            </button>
                          </>
                        )}
                      </div>
                      <SortableList ids={galleryImages} strategy={horizontalListSortingStrategy} onReorder={moveGallery}>
                      <div className="pl-1 py-1 mt-4 flex gap-2 overflow-x-auto scrollbar-hide">
                        {galleryImages.map((img, idx) => (
                          <SortableItem key={img} id={img}>
                            {({ setNodeRef, style, handle }) => (
                          <div ref={setNodeRef} style={style} className="relative group/thumb shrink-0 w-[calc((100%-2.5rem)/6)]">
                            <button type="button" onClick={() => setActiveGalleryIndex(idx)}
                              className={`block aspect-4/3 w-full rounded-2xl overflow-hidden transition-opacity ${idx === safeIdx ? "opacity-100 ring-2 ring-crimson-red" : "opacity-60 hover:opacity-80"}`}>
                              <img src={resolveImg(img)} alt={`Header ${idx + 1}`} className="w-full h-full object-cover" />
                            </button>
                            {/* Hover overlay: centered camera icon + corner delete */}
                            <div className="absolute inset-0 rounded-2xl opacity-0 group-hover/thumb:opacity-100 transition-opacity pointer-events-none bg-black/30" />
                            <button type="button"
                              onClick={() => setPickerState({ field: `gallery-edit-${idx}`, initialUrl: resolveImg(img) || undefined })}
                              className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity rounded-2xl">
                              <Camera className="h-4 w-4 text-white drop-shadow" />
                            </button>
                            <button type="button" onClick={() => { rmGallery(idx); setActiveGalleryIndex(0); }}
                              className="absolute top-0.5 right-0.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity bg-crimson-red text-white rounded-full w-4 h-4 flex items-center justify-center">
                              <X className="h-2.5 w-2.5" />
                            </button>
                            <DragHandle handle={handle} className="absolute top-0.5 left-0.5 z-10 opacity-0 group-hover/thumb:opacity-100 transition-opacity bg-white/90 hover:bg-white rounded-full p-0.5 shadow-small" />
                          </div>
                            )}
                          </SortableItem>
                        ))}
                        <button type="button" onClick={() => setPickerState({ field: "gallery-add", multiple: true })}
                          className="shrink-0 w-[calc((100%-2.5rem)/6)] aspect-4/3 rounded-2xl border-2 border-dashed border-dark-gray/20 flex items-center justify-center cursor-pointer hover:border-crimson-red/40 hover:bg-crimson-red/5 transition-colors">
                          <Plus className="h-5 w-5 text-dark-gray/40" />
                        </button>
                      </div>
                      </SortableList>
                    </div>
                  );
                })()}

                {/* ── ONE main card: all content sections ──────────────────── */}
                <div id="section-description" className="mt-6 rounded-3xl bg-white px-5 py-8 md:px-10 md:py-10">

                  {/* Tour Header: duration | name — wraps naturally like www */}
                  {(() => {
                    const hClass = "font-hk-grotesk text-[2rem] md:text-[2.5rem] font-bold leading-[1.2] md:tracking-[-0.02em] text-midnight";
                    return (
                      <EditZone label="Header">
                        <div className="flex items-start gap-x-1">
                          <div data-field="duration" className="flex items-baseline gap-x-1 shrink-0">
                            <AutoSizeInput value={duration} onChange={(v) => sv("duration", v)} placeholder="11 days"
                              className={hClass} />
                            <span className={`${hClass} select-none`}> | </span>
                          </div>
                          <div data-field="name" className="flex-1 min-w-32">
                            <InlineTextarea value={name} onChange={(v) => sv("name", v)} placeholder="Tour Name"
                              className={hClass} />
                          </div>
                        </div>
                      </EditZone>
                    );
                  })()}

                  {/* Tags */}
                  <SortableList ids={(tagFields as any[]).map((f) => f.id)} strategy={rectSortingStrategy} onReorder={(a, b) => moveTag(a, b)}>
                  <div className="mt-6 flex flex-wrap gap-2 items-center">
                    {(tagFields as any[]).map((field, i) => {
                      const tag = tags?.[i];
                      const TagIcon = ICON_COMPONENTS[tag?.icon ?? "location"] ?? MapPin;
                      return (
                        <SortableItem key={field.id} id={field.id}>
                          {({ setNodeRef, style, handle }) => (
                        <span ref={setNodeRef} style={style} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-body font-medium text-sm ${TAG_PALETTE[i % 4]} group/tag`}>
                          <DragHandle handle={handle} className="-ml-1.5 shrink-0 opacity-0 group-hover/tag:opacity-100 transition-opacity text-current!" />
                          <TagIcon className="size-3.5 shrink-0" strokeWidth={2.75} />
                          <AutoSizeInput value={tag?.label ?? ""} onChange={(v) => sv(`details.tags.${i}.label`, v)} placeholder="Tag" className="font-body text-sm" compact />
                          <button type="button" onClick={() => rmTag(i)} className="w-0 overflow-hidden group-hover/tag:w-auto transition-all opacity-0 group-hover/tag:opacity-100"><X className="size-3" /></button>
                        </span>
                          )}
                        </SortableItem>
                      );
                    })}
                    <button type="button" onClick={() => (addTag as any)({ label: "", icon: "location" })}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-dark-gray/30 px-3 py-1.5 font-body text-b4-desktop text-dark-gray/60 hover:border-crimson-red/40 hover:text-crimson-red transition-colors">
                      <Plus className="size-3.5" /> Tag
                    </button>
                  </div>
                  </SortableList>

                  {/* Description */}
                  <EditZone label="Description" className="mt-6 max-w-3xl">
                    <div data-field="description">
                      <InlineTextarea value={gv("description") ?? ""} onChange={(v) => sv("description", v)}
                        placeholder="Describe the tour experience…" className="font-body text-b2-mobile md:text-b2-desktop text-dark-gray" />
                    </div>
                  </EditZone>

                  {/* Key Facts */}
                  <section id="section-key-facts" className="mt-8 md:mt-10 w-full">
                    <ul className="flex flex-col gap-6">
                      {/* Tour Dates — derived from travelDates; edited via modal */}
                      <li className="flex items-start gap-4 group/td">
                        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-light-grey">
                          <Calendar className="size-5 text-midnight" strokeWidth={2.75} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-hk-grotesk text-b2-mobile md:text-b2-desktop font-bold! text-midnight">Tour Dates</p>
                            <button type="button" onClick={() => setDatesModalOpen(true)}
                              className="flex items-center gap-1 text-xs text-crimson-red hover:text-light-red">
                              <Pencil className="h-3 w-3" /> Edit dates
                            </button>
                          </div>
                          <ul className="mt-1 space-y-0.5">
                            {tourDateValues.length === 0 ? (
                              <li className="flex items-center gap-2 font-body text-b2-mobile md:text-b2-desktop text-dark-gray">
                                <span className="inline-block size-1.5 shrink-0 rounded-full bg-crimson-red" aria-hidden />
                                To be announced
                              </li>
                            ) : tourDateValues.map((v, idx) => (
                              <li key={idx} className="flex items-center gap-2 font-body text-b2-mobile md:text-b2-desktop text-dark-gray">
                                <span className="inline-block size-1.5 shrink-0 rounded-full bg-crimson-red" aria-hidden />
                                {v}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </li>
                      {(() => {
                        // Reorder only the editable facts; the derived "Tour Dates" row
                        // stays pinned above. Map visible→actual index so moveKf is correct.
                        const visible = (kfFields as any[])
                          .map((f, i) => ({ f, i }))
                          .filter(({ i }) => kfData?.[i]?.label !== "Tour Dates");
                        return (
                          <SortableList
                            ids={visible.map((v) => v.f.id)}
                            strategy={verticalListSortingStrategy}
                            onReorder={(a, b) => moveKf(visible[a].i, visible[b].i)}
                          >
                            {visible.map(({ f: field, i }) => {
                              const kf = kfData?.[i];
                              const KfIcon = ICON_COMPONENTS[kf?.icon ?? "days"] ?? Calendar;
                              return (
                                <SortableItem key={field.id} id={field.id}>
                                  {({ setNodeRef, style, handle }) => (
                          <li ref={setNodeRef} style={style} className="flex items-start gap-4 group/kf">
                            <Select value={kf?.icon ?? "days"} onValueChange={(v) => sv(`details.keyFacts.${i}.icon`, v)}>
                              <SelectTrigger className="flex size-12 shrink-0 items-center justify-center rounded-full bg-light-grey border-0 p-0 [&>svg:last-child]:hidden hover:ring-2 hover:ring-crimson-red/20 transition-shadow">
                                <KfIcon className="size-5 text-midnight" strokeWidth={2.75} />
                              </SelectTrigger>
                              <SelectContent>{ALL_ICONS.map((k) => { const IC = ICON_COMPONENTS[k]; return <SelectItem key={k} value={k}><span className="flex items-center gap-2"><IC className="h-4 w-4" />{k}</span></SelectItem>; })}</SelectContent>
                            </Select>
                            <div className="flex-1 min-w-0">
                              <InlineInput value={kf?.label ?? ""} onChange={(v) => sv(`details.keyFacts.${i}.label`, v)}
                                placeholder="Label" className="font-hk-grotesk text-b2-mobile md:text-b2-desktop font-bold! text-midnight" />
                              {(() => {
                                // The three template facts use bespoke structured editors; any
                                // custom fact falls back to the generic one-per-line textarea.
                                const setVal = (v: string) => sv(`details.keyFacts.${i}.values`, v ? [v] : []);
                                const joined = (kf?.values ?? []).join("\n");
                                if (kf?.label === "Duration") return <DurationFact value={joined} onChange={setVal} />;
                                if (kf?.label === "Destination") return <DestinationFact value={joined} onChange={setVal} />;
                                if (kf?.label === "Group Size") return <GroupSizeFact value={joined} onChange={setVal} />;
                                return (
                                  <InlineTextarea
                                    value={joined}
                                    onChange={(v) => sv(`details.keyFacts.${i}.values`, v.split("\n").filter(Boolean))}
                                    placeholder="Value (one per line)"
                                    className="mt-1 font-body text-b2-mobile md:text-b2-desktop text-dark-gray" />
                                );
                              })()}
                            </div>
                            <DragHandle handle={handle} className="opacity-0 group-hover/kf:opacity-100 transition-opacity mt-3 shrink-0" />
                            <button type="button" onClick={() => rmKf(i)}
                              className="opacity-0 group-hover/kf:opacity-100 transition-opacity text-crimson-red mt-1 shrink-0">
                              <X className="h-4 w-4" />
                            </button>
                          </li>
                                  )}
                                </SortableItem>
                              );
                            })}
                          </SortableList>
                        );
                      })()}
                    </ul>
                    <button type="button" onClick={() => (addKf as any)({ icon: "days", label: "", values: [""] })}
                      className="mt-6 flex items-center gap-1 font-body text-b4-desktop text-crimson-red hover:text-light-red">
                      <Plus className="h-4 w-4" /> Add key fact
                    </button>
                  </section>

                  {/* What's Included */}
                  <section id="section-inclusions" className="mt-10 md:mt-14 w-full">
                    <h2 className="font-hk-grotesk text-h3-mobile md:text-h3-desktop text-midnight">What's Included</h2>
                    <SortableList ids={(inclFields as any[]).map((f) => f.id)} strategy={rectSortingStrategy} onReorder={(a, b) => moveIncl(a, b)}>
                    <ul className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                      {(inclFields as any[]).map((field, i) => {
                        const incl = inclusions?.[i];
                        const IncIcon = ICON_COMPONENTS[incl?.icon ?? "plus"] ?? CheckCircle2;
                        const rawValue: string = Array.isArray(incl?.value) ? incl.value.join("\n") : (incl?.value ?? "");
                        return (
                          <SortableItem key={field.id} id={field.id}>
                            {({ setNodeRef, style, handle }) => (
                          <li ref={setNodeRef} style={style} className="flex items-start gap-4 group/incl">
                            <Select value={incl?.icon ?? "plus"} onValueChange={(v) => sv(`details.inclusions.${i}.icon`, v)}>
                              <SelectTrigger className="flex size-12 shrink-0 items-center justify-center rounded-full bg-light-grey text-midnight border-0 p-0 [&>svg:last-child]:hidden hover:ring-2 hover:ring-crimson-red/20 transition-shadow">
                                <IncIcon className="size-5" />
                              </SelectTrigger>
                              <SelectContent>{ALL_ICONS.map((k) => { const IC = ICON_COMPONENTS[k]; return <SelectItem key={k} value={k}><span className="flex items-center gap-2"><IC className="h-4 w-4" />{k}</span></SelectItem>; })}</SelectContent>
                            </Select>
                            <div className="flex-1 min-w-0">
                              <InlineInput value={incl?.label ?? ""} onChange={(v) => sv(`details.inclusions.${i}.label`, v)} placeholder="Label" className="font-hk-grotesk text-b2-desktop font-bold text-midnight" />
                              {(() => {
                                const setVal = (v: string) => sv(`details.inclusions.${i}.value`, v);
                                if (incl?.label === "Meals") return <MealsInclusion value={rawValue} onChange={setVal} />;
                                if (incl?.label === "Accommodation") return <AccommodationInclusion value={rawValue} onChange={setVal} />;
                                return <InlineBulletTextarea value={rawValue} onChange={setVal} placeholder={INCLUSION_DEFAULTS[incl?.label ?? ""] || "Detail (use - for bullets)"} bulleted={/activities|others?|transport/i.test(incl?.label ?? "")} className="mt-1 font-body text-b4-mobile md:text-b4-desktop text-dark-gray" />;
                              })()}
                            </div>
                            <DragHandle handle={handle} className="opacity-0 group-hover/incl:opacity-100 transition-opacity mt-1 shrink-0" />
                            <button type="button" onClick={() => rmIncl(i)} className="opacity-0 group-hover/incl:opacity-100 transition-opacity text-crimson-red mt-1 shrink-0"><X className="h-4 w-4" /></button>
                          </li>
                            )}
                          </SortableItem>
                        );
                      })}
                    </ul>
                    </SortableList>
                    <button type="button" onClick={() => (addIncl as any)({ icon: "plus", label: "", value: "" })}
                      className="mt-6 flex items-center gap-1 font-body text-b4-desktop text-crimson-red hover:text-light-red">
                      <Plus className="h-4 w-4" /> Add inclusion
                    </button>
                  </section>

                  {/* Trip Highlights */}
                  <section id="section-highlights" className="mt-10 md:mt-14 w-full">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="font-hk-grotesk text-h3-mobile md:text-h3-desktop text-midnight">Trip Highlights</h2>
                      <div className="flex shrink-0 gap-2">
                        <button type="button"
                          onClick={() => hlScrollRef.current?.scrollBy({ left: -(hlScrollRef.current.offsetWidth / 2 + 12), behavior: "smooth" })}
                          className="flex size-9 items-center justify-center rounded-full border border-midnight text-midnight transition-all hover:border-crimson-red hover:text-crimson-red active:scale-90 active:bg-light-grey">
                          <ChevronLeft className="size-4" strokeWidth={2.25} />
                        </button>
                        <button type="button"
                          onClick={() => hlScrollRef.current?.scrollBy({ left: hlScrollRef.current.offsetWidth / 2 + 12, behavior: "smooth" })}
                          className="flex size-9 items-center justify-center rounded-full border border-midnight text-midnight transition-all hover:border-crimson-red hover:text-crimson-red active:scale-90 active:bg-light-grey">
                          <ChevronRight className="size-4" strokeWidth={2.25} />
                        </button>
                      </div>
                    </div>
                    <SortableList ids={(hlFields as any[]).map((f) => f.id)} strategy={horizontalListSortingStrategy} onReorder={(a, b) => moveHl(a, b)}>
                    <div ref={hlScrollRef} className="mt-8 flex gap-6 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
                      {(hlFields as any[]).map((field, i) => {
                        const hl = highlights?.[i];
                        return (
                          <SortableItem key={field.id} id={field.id}>
                            {({ setNodeRef, style, handle }) => (
                          <div ref={setNodeRef} style={style} className="group/hl shrink-0 w-[calc(50%-12px)] snap-start flex flex-col gap-4">
                            <div className="relative aspect-4/3 w-full overflow-hidden rounded-3xl bg-light-grey group/hlimg">
                              {hl?.image ? (
                                <>
                                  <img src={resolveImg(hl.image)} alt="" className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/0 group-hover/hlimg:bg-black/20 transition-colors" />
                                  <button type="button"
                                    onClick={() => setPickerState({ field: `highlight-${i}`, initialUrl: resolveImg(hl.image) || undefined })}
                                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/hlimg:opacity-100 transition-opacity">
                                    <Camera className="h-5 w-5 text-white drop-shadow" />
                                  </button>
                                  <button type="button" onClick={() => sv(`details.highlights.${i}`, { ...hl, image: undefined })}
                                    className="absolute top-2 right-2 opacity-0 group-hover/hlimg:opacity-100 transition-opacity bg-crimson-red text-white rounded-full w-6 h-6 flex items-center justify-center">
                                    <X className="h-3 w-3" />
                                  </button>
                                </>
                              ) : (
                                <button type="button" onClick={() => setPickerState({ field: `highlight-${i}` })}
                                  className="flex flex-col items-center justify-center h-full w-full cursor-pointer hover:bg-light-grey/70">
                                  <ImageIcon className="h-8 w-8 text-dark-gray/30 mb-1" />
                                  <span className="text-xs text-dark-gray/40">Add image</span>
                                </button>
                              )}
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-start gap-2">
                                <InlineTextarea value={hl?.text ?? ""} onChange={(v) => sv(`details.highlights.${i}`, { ...hl, text: v })} placeholder="Highlight text" className="font-hk-grotesk text-h6-mobile md:text-h6-desktop font-bold text-midnight flex-1" />
                                <DragHandle handle={handle} className="shrink-0 mt-1 opacity-0 group-hover/hl:opacity-100 transition-opacity" />
                                <button type="button" onClick={() => rmHl(i)} className="text-crimson-red shrink-0 mt-0.5"><X className="h-4 w-4" /></button>
                              </div>
                              <InlineInput value={hl?.subtitle ?? ""} onChange={(v) => sv(`details.highlights.${i}`, { ...hl, subtitle: v })} placeholder="Subtitle (optional)" className="font-body text-b4-mobile md:text-b4-desktop text-dark-gray" />
                            </div>
                          </div>
                            )}
                          </SortableItem>
                        );
                      })}
                    </div>
                    </SortableList>
                    <button type="button" onClick={() => { (addHl as any)({ text: "", image: undefined, subtitle: undefined }); setTimeout(() => hlScrollRef.current?.scrollTo({ left: hlScrollRef.current.scrollWidth, behavior: "smooth" }), 50); }}
                      className="mt-6 flex items-center gap-1 font-body text-b4-desktop text-crimson-red hover:text-light-red">
                      <Plus className="h-4 w-4" /> Add highlight
                    </button>
                  </section>

                  {/* Map */}
                  {(mapData?.image || mapData?.embedUrl) && (
                    <section id="section-map" className="mt-10 md:mt-14 w-full">
                      <h2 className="font-hk-grotesk text-h3-mobile md:text-h3-desktop text-midnight">Map</h2>
                      <div className="mt-8 relative aspect-video w-full overflow-hidden rounded-3xl bg-light-grey">
                        {mapData.embedUrl ? <iframe src={toEmbedUrl(mapData.embedUrl)} className="w-full h-full" /> : mapData.image ? <img src={resolveImg(mapData.image)} alt="Map" className="w-full h-full object-cover" /> : null}
                      </div>
                    </section>
                  )}

                  {/* Itinerary */}
                  <section id="section-itinerary" className="mt-10 md:mt-14 w-full">
                    <h2 className="font-hk-grotesk text-h3-mobile md:text-h3-desktop text-midnight">Itinerary</h2>
                    <SortableList ids={(iterFields as any[]).map((f) => f.id)} strategy={verticalListSortingStrategy} onReorder={(a, b) => moveIter(a, b)}>
                    <ol className="mt-8 divide-y divide-light-grey border-t border-light-grey">
                      {(iterFields as any[]).map((field, i) => {
                        const day = itinerary?.[i];
                        const isOpen = !collapsedDays.has(i);
                        return (
                          <SortableItem key={field.id} id={field.id}>
                            {({ setNodeRef, style, handle }) => (
                          <li ref={setNodeRef} style={style} className="group/day">
                            <div className="flex items-center gap-3 py-4">
                              <DragHandle handle={handle} className="shrink-0 opacity-0 group-hover/day:opacity-100 transition-opacity" />
                              <span className="size-7 shrink-0 bg-crimson-red text-white rounded-full flex items-center justify-center font-hk-grotesk font-bold text-b4-desktop">{i + 1}</span>
                              <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                                <span className="font-hk-grotesk text-h6-mobile md:text-h6-desktop font-bold text-midnight shrink-0">Day {i + 1}</span>
                                <InlineInput value={day?.title ?? ""} onChange={(v) => sv(`details.itinerary.${i}.title`, v)} placeholder="Day title…" className="font-hk-grotesk text-h6-mobile md:text-h6-desktop text-crimson-red" />
                              </div>
                              <button type="button" onClick={() => setCollapsedDays((p) => { const n = new Set(p); if (n.has(i)) { n.delete(i); } else { n.add(i); } return n; })}
                                className={`size-5 shrink-0 text-midnight transition-transform ${isOpen ? "rotate-180" : ""}`}>
                                <ChevronDown className="h-5 w-5" />
                              </button>
                              <button type="button" onClick={() => rmIter(i)} disabled={iterFields.length === 1} className="text-crimson-red opacity-0 group-hover/day:opacity-100 disabled:opacity-0 transition-opacity"><X className="h-4 w-4" /></button>
                            </div>
                            {isOpen && (
                              <div className="pb-5 grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-[1fr_348px]">
                                <InlineTextarea value={day?.description ?? ""} onChange={(v) => sv(`details.itinerary.${i}.description`, v)} placeholder="Describe this day…" className="font-body text-b4-mobile md:text-b4-desktop text-dark-gray" />
                                <div className="relative aspect-16/10 overflow-hidden rounded-2xl bg-light-grey md:row-span-2 group/dayimg">
                                  {day?.image ? (
                                    <>
                                      <img src={resolveImg(day.image)} alt={`Day ${i + 1}`} className="w-full h-full object-cover" />
                                      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover/dayimg:opacity-100 transition-opacity pointer-events-none bg-black/30" />
                                      <button type="button"
                                        onClick={() => setPickerState({ field: `itinerary-${i}`, initialUrl: resolveImg(day?.image) || undefined })}
                                        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/dayimg:opacity-100 transition-opacity">
                                        <Camera className="h-5 w-5 text-white drop-shadow" />
                                      </button>
                                      <button type="button" onClick={() => sv(`details.itinerary.${i}.image`, "")}
                                        className="absolute top-2 right-2 opacity-0 group-hover/dayimg:opacity-100 transition-opacity bg-crimson-red text-white rounded-full w-6 h-6 flex items-center justify-center">
                                        <X className="h-3 w-3" />
                                      </button>
                                    </>
                                  ) : (
                                    <button type="button" onClick={() => setPickerState({ field: `itinerary-${i}` })}
                                      className="flex flex-col items-center justify-center h-full w-full cursor-pointer hover:bg-light-grey/70">
                                      <ImageIcon className="h-8 w-8 text-dark-gray/30 mb-1" />
                                      <span className="text-xs text-dark-gray/40">Add image</span>
                                    </button>
                                  )}
                                </div>
                                <div className="border-t border-light-grey/60 pt-3">
                                  <ul className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                                    {(day?.details ?? []).map((det: any, di: number) => {
                                      const DetIcon = ICON_COMPONENTS[det?.icon ?? "activities"] ?? Compass;
                                      return (
                                        <li key={di} className="flex items-start gap-3 group/det">
                                          <Select value={det?.icon ?? "activities"} onValueChange={(v) => {
                                            const arr = [...(gv(`details.itinerary.${i}.details`) ?? [])];
                                            arr[di] = { ...arr[di], icon: v };
                                            sv(`details.itinerary.${i}.details`, arr);
                                          }}>
                                            <SelectTrigger className="shrink-0 mt-0.5 border-0 bg-transparent shadow-none p-0 w-auto h-auto text-midnight [&>svg:last-child]:hidden hover:text-crimson-red transition-colors">
                                              <DetIcon className="size-4" />
                                            </SelectTrigger>
                                            <SelectContent>{ALL_ICONS.map((k) => { const IC = ICON_COMPONENTS[k]; return <SelectItem key={k} value={k}><span className="flex items-center gap-2"><IC className="h-4 w-4" />{k}</span></SelectItem>; })}</SelectContent>
                                          </Select>
                                          <div className="flex-1 min-w-0">
                                            <InlineInput
                                              value={det?.label ?? ""}
                                              onChange={(v) => {
                                                const arr = [...(gv(`details.itinerary.${i}.details`) ?? [])];
                                                arr[di] = { ...arr[di], label: v };
                                                sv(`details.itinerary.${i}.details`, arr);
                                              }}
                                              placeholder="Label"
                                              className="font-hk-grotesk text-b4-mobile font-bold! text-midnight w-full"
                                            />
                                            {/^meals?$/i.test(det?.label ?? "") || det?.icon === "meals" ? (
                                              <MealChips
                                                value={det?.value ?? ""}
                                                onChange={(v) => {
                                                  const arr = [...(gv(`details.itinerary.${i}.details`) ?? [])];
                                                  arr[di] = { ...arr[di], value: v };
                                                  sv(`details.itinerary.${i}.details`, arr);
                                                }}
                                              />
                                            ) : (
                                              <InlineBulletTextarea
                                                value={det?.value ?? ""}
                                                onChange={(v) => {
                                                  const arr = [...(gv(`details.itinerary.${i}.details`) ?? [])];
                                                  arr[di] = { ...arr[di], value: v };
                                                  sv(`details.itinerary.${i}.details`, arr);
                                                }}
                                                placeholder="Detail (use - for bullets)"
                                                className="mt-0.5 font-body text-b4-mobile text-dark-gray"
                                              />
                                            )}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const arr = (gv(`details.itinerary.${i}.details`) ?? []).filter((_: unknown, j: number) => j !== di);
                                              sv(`details.itinerary.${i}.details`, arr);
                                            }}
                                            className="opacity-0 group-hover/det:opacity-100 transition-opacity text-crimson-red mt-0.5 shrink-0"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const arr = [...(gv(`details.itinerary.${i}.details`) ?? []), { icon: "activities", label: "", value: "" }];
                                      sv(`details.itinerary.${i}.details`, arr);
                                    }}
                                    className="mt-6 flex items-center gap-1 font-body text-b4-desktop text-crimson-red hover:text-light-red"
                                  >
                                    <Plus className="h-4 w-4" /> Add detail
                                  </button>
                                </div>
                              </div>
                            )}
                          </li>
                            )}
                          </SortableItem>
                        );
                      })}
                    </ol>
                    </SortableList>
                    <button type="button" onClick={() => addIter({ day: iterFields.length + 1, title: "", description: "", image: undefined, accommodation: undefined, activities: undefined, meals: undefined, details: cloneDayDetails() })}
                      className="mt-6 flex items-center gap-1 font-body text-b4-desktop text-crimson-red hover:text-light-red">
                      <Plus className="h-4 w-4" /> Add Day {iterFields.length + 1}
                    </button>
                  </section>

                  {/* Where We Stay */}
                  <section id="section-accommodations" className="mt-10 md:mt-14 w-full">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="font-hk-grotesk text-h3-mobile md:text-h3-desktop text-midnight">Where We Stay</h2>
                      <div className="flex shrink-0 gap-2">
                        <button type="button"
                          onClick={() => accomScrollRef.current?.scrollBy({ left: -(accomScrollRef.current.offsetWidth / 2 + 12), behavior: "smooth" })}
                          className="flex size-9 items-center justify-center rounded-full border border-midnight text-midnight transition-all hover:border-crimson-red hover:text-crimson-red active:scale-90 active:bg-light-grey">
                          <ChevronLeft className="size-4" strokeWidth={2.25} />
                        </button>
                        <button type="button"
                          onClick={() => accomScrollRef.current?.scrollBy({ left: accomScrollRef.current.offsetWidth / 2 + 12, behavior: "smooth" })}
                          className="flex size-9 items-center justify-center rounded-full border border-midnight text-midnight transition-all hover:border-crimson-red hover:text-crimson-red active:scale-90 active:bg-light-grey">
                          <ChevronRight className="size-4" strokeWidth={2.25} />
                        </button>
                      </div>
                    </div>
                    <SortableList ids={(accomFields as any[]).map((f) => f.id)} strategy={horizontalListSortingStrategy} onReorder={(a, b) => moveAccom(a, b)}>
                    <div ref={accomScrollRef} className="mt-8 flex gap-6 overflow-x-auto scrollbar-hide snap-x snap-mandatory">
                      {(accomFields as any[]).map((field, i) => {
                        const ac = accoms?.[i];
                        return (
                          <SortableItem key={field.id} id={field.id}>
                            {({ setNodeRef, style, handle }) => (
                          <div ref={setNodeRef} style={style} className="group/ac shrink-0 w-[calc(50%-12px)] snap-start flex flex-col gap-4">
                            <div className="relative aspect-4/3 overflow-hidden rounded-3xl bg-light-grey group/acimg">
                              {ac?.image
                                ? <img src={resolveImg(ac.image)} alt="" className="w-full h-full object-cover" />
                                : <button type="button" onClick={() => setPickerState({ field: `accommodation-${i}` })}
                                    className="flex flex-col items-center justify-center h-full w-full cursor-pointer hover:bg-light-grey/70">
                                    <ImageIcon className="h-8 w-8 text-dark-gray/30 mb-1" />
                                    <span className="text-xs text-dark-gray/40">Add image</span>
                                  </button>}
                              {ac?.image && (
                                <>
                                  <button type="button"
                                    onClick={() => setPickerState({ field: `accommodation-${i}`, initialUrl: resolveImg(ac.image) || undefined })}
                                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/acimg:opacity-100 transition-opacity">
                                    <Camera className="h-5 w-5 text-white drop-shadow" />
                                  </button>
                                  <button type="button" onClick={() => sv(`details.accommodations.${i}.image`, "")}
                                    className="absolute top-2 right-2 opacity-0 group-hover/acimg:opacity-100 transition-opacity bg-crimson-red text-white rounded-full w-6 h-6 flex items-center justify-center">
                                    <X className="h-3 w-3" />
                                  </button>
                                </>
                              )}
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <InlineInput value={ac?.name ?? ""} onChange={(v) => sv(`details.accommodations.${i}.name`, v)} placeholder="Hotel name" className="font-hk-grotesk text-xl font-bold text-midnight flex-1" />
                                <DragHandle handle={handle} className="shrink-0 opacity-0 group-hover/ac:opacity-100 transition-opacity" />
                                <button type="button" onClick={() => rmAccom(i)} className="text-crimson-red shrink-0"><X className="h-4 w-4" /></button>
                              </div>
                              <InlineInput value={ac?.nights ?? ""} onChange={(v) => sv(`details.accommodations.${i}.nights`, v)} placeholder="e.g. 2 nights in hotel" className="font-body text-sm text-dark-gray" />
                              <div className="flex items-center gap-1.5">
                                <ExternalLink className="h-3 w-3 text-dark-gray/40 shrink-0" />
                                <InlineInput value={ac?.image ?? ""} onChange={(v) => sv(`details.accommodations.${i}.image`, v)} placeholder="Image URL (or use camera above)" className="font-body text-xs text-dark-gray/40 flex-1" />
                              </div>
                            </div>
                          </div>
                            )}
                          </SortableItem>
                        );
                      })}
                    </div>
                    </SortableList>
                    <button type="button" onClick={() => { (addAccom as any)({ name: "", nights: "", image: "" }); setTimeout(() => accomScrollRef.current?.scrollTo({ left: accomScrollRef.current.scrollWidth, behavior: "smooth" }), 50); }}
                      className="mt-6 flex items-center gap-1 font-body text-b4-desktop text-crimson-red hover:text-light-red">
                      <Plus className="h-4 w-4" /> Add accommodation
                    </button>
                  </section>

                  {/* FAQs */}
                  <section id="section-faqs" className="mt-10 md:mt-14 w-full">
                    <div className="flex items-center justify-between">
                      <h2 className="font-hk-grotesk text-h3-mobile md:text-h3-desktop text-midnight">FAQs</h2>
                      {faqFields.length > 0 && (
                        <button type="button"
                          onClick={() => setCollapsedFaqs(collapsedFaqs.size === 0 ? new Set((faqFields as any[]).map((_, i) => i)) : new Set())}
                          className="font-body text-b4-desktop text-crimson-red underline-offset-2 hover:underline">
                          {collapsedFaqs.size === 0 ? "Collapse All" : "Expand All"}
                        </button>
                      )}
                    </div>
                    {faqFields.length > 0 && (
                      <SortableList ids={(faqFields as any[]).map((f) => f.id)} strategy={verticalListSortingStrategy} onReorder={(a, b) => moveFaq(a, b)}>
                      <dl className="mt-8">
                        {(faqFields as any[]).map((field, i) => {
                          const faq = faqs?.[i];
                          const isOpen = !collapsedFaqs.has(i);
                          return (
                            <SortableItem key={field.id} id={field.id}>
                              {({ setNodeRef, style, handle }) => (
                            <div ref={setNodeRef} style={style} className="border-b border-[#d7d6db] group/faq">
                              <div className="flex w-full items-center justify-between gap-4 py-3">
                                <InlineInput value={faq?.question ?? ""} onChange={(v) => sv(`details.faqs.${i}.question`, v)}
                                  placeholder="Question" className="font-hk-grotesk text-h6-mobile md:text-h6-desktop text-midnight flex-1" />
                                <div className="flex items-center gap-2 shrink-0">
                                  <button type="button" onClick={() => setCollapsedFaqs((prev) => { const next = new Set(prev); if (next.has(i)) { next.delete(i); } else { next.add(i); } return next; })}
                                    className={`transition-transform ${isOpen ? "rotate-180" : ""}`}>
                                    <ChevronDown className="size-5 text-midnight" />
                                  </button>
                                  <DragHandle handle={handle} className="opacity-0 group-hover/faq:opacity-100 transition-opacity" />
                                  <button type="button" onClick={() => rmFaq(i)} className="opacity-0 group-hover/faq:opacity-100 transition-opacity text-crimson-red"><X className="size-4" /></button>
                                </div>
                              </div>
                              {isOpen && (
                                <div className="pb-4">
                                  <InlineTextarea value={faq?.answer ?? ""} onChange={(v) => sv(`details.faqs.${i}.answer`, v)}
                                    placeholder="Answer…" className="font-body text-b2-mobile md:text-b2-desktop text-midnight" />
                                </div>
                              )}
                            </div>
                              )}
                            </SortableItem>
                          );
                        })}
                      </dl>
                      </SortableList>
                    )}
                    <button type="button" onClick={() => (addFaq as any)({ question: "", answer: "" })}
                      className="mt-6 flex items-center gap-1 font-body text-b4-desktop text-crimson-red hover:text-light-red">
                      <Plus className="h-4 w-4" /> Add FAQ
                    </button>
                  </section>

                  {/* Things to Know */}
                  <section id="section-things-to-know" className="mt-10 md:mt-14 w-full">
                    <h2 className="font-hk-grotesk text-h3-mobile md:text-h3-desktop text-midnight">Things to Know</h2>
                    {ttkFields.length > 0 ? (
                      <>
                        <SortableList ids={(ttkFields as any[]).map((f) => f.id)} strategy={rectSortingStrategy} onReorder={(a, b) => moveTtk(a, b)}>
                        <ul className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                          {(ttkFields as any[]).map((field, i) => {
                            const ttk = ttks?.[i];
                            const Icon = ICON_COMPONENTS[ttk?.icon ?? "info"] ?? Info;
                            return (
                              <SortableItem key={field.id} id={field.id}>
                                {({ setNodeRef, style, handle }) => (
                              <li ref={setNodeRef} style={style} className="flex flex-col gap-4 rounded-3xl border border-light-grey p-6 md:p-8 group/ttk">
                                <div className="flex items-start justify-between">
                                  <Select value={ttk?.icon ?? "info"} onValueChange={(v) => sv(`details.thingsToKnow.${i}.icon`, v)}>
                                    <SelectTrigger className="flex size-14 items-center justify-center rounded-full bg-light-grey text-midnight border-0 p-0 [&>svg:last-child]:hidden"><Icon className="h-6 w-6 text-midnight" /></SelectTrigger>
                                    <SelectContent>{ALL_ICONS.map((k) => { const IC = ICON_COMPONENTS[k]; return <SelectItem key={k} value={k}><span className="flex items-center gap-2"><IC className="h-4 w-4" />{k}</span></SelectItem>; })}</SelectContent>
                                  </Select>
                                  <div className="flex items-center gap-2">
                                    <DragHandle handle={handle} className="opacity-0 group-hover/ttk:opacity-100 transition-opacity" />
                                    <button type="button" onClick={() => rmTtk(i)} className="text-crimson-red opacity-0 group-hover/ttk:opacity-100 transition-opacity"><X className="h-4 w-4" /></button>
                                  </div>
                                </div>
                                <InlineInput value={ttk?.title ?? ""} onChange={(v) => sv(`details.thingsToKnow.${i}.title`, v)} placeholder="Title" className="font-hk-grotesk text-h5-mobile md:text-h5-desktop text-midnight" />
                                <InlineTextarea value={ttk?.description ?? ""} onChange={(v) => sv(`details.thingsToKnow.${i}.description`, v)} placeholder="Description…" className="font-body text-b4-mobile md:text-b4-desktop text-dark-gray" />
                                <div className="mt-auto space-y-1">
                                  <div className="flex items-center gap-1">
                                    <InlineInput value={ttk?.ctaLabel ?? ""} onChange={(v) => sv(`details.thingsToKnow.${i}.ctaLabel`, v)} placeholder="CTA label" className="font-body text-sm font-bold text-crimson-red" />
                                    <ChevronRight className="h-4 w-4 text-crimson-red shrink-0" />
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <ExternalLink className="h-3 w-3 text-dark-gray/40 shrink-0" />
                                    <InlineInput value={ttk?.ctaHref ?? ""} onChange={(v) => sv(`details.thingsToKnow.${i}.ctaHref`, v)} placeholder="https://www.imheretravels.com/…" className="font-body text-xs text-dark-gray/40 flex-1" />
                                  </div>
                                </div>
                              </li>
                                )}
                              </SortableItem>
                            );
                          })}
                        </ul>
                        </SortableList>
                        <div className="mt-6 flex items-center gap-4">
                          <button type="button" onClick={() => (addTtk as any)({ icon: "info", title: "", description: "", ctaLabel: "", ctaHref: "" })}
                            className="flex items-center gap-1 font-body text-b4-desktop text-crimson-red hover:text-light-red">
                            <Plus className="h-4 w-4" /> Add card
                          </button>
                          <button type="button" onClick={() => replaceTtk(cloneThingsToKnow())}
                            className="flex items-center gap-1 font-body text-b4-desktop text-dark-gray hover:text-midnight">
                            <RotateCcw className="h-4 w-4" /> Reset to default
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="mt-4 flex items-center gap-4">
                        <button type="button" onClick={() => (addTtk as any)({ icon: "info", title: "", description: "", ctaLabel: "", ctaHref: "" })}
                          className="flex items-center gap-1 font-body text-b4-desktop text-crimson-red hover:text-light-red">
                          <Plus className="h-4 w-4" /> Add card
                        </button>
                        <button type="button" onClick={() => replaceTtk(cloneThingsToKnow())}
                          className="flex items-center gap-1 font-body text-b4-desktop text-dark-gray hover:text-midnight">
                          <RotateCcw className="h-4 w-4" /> Reset to default
                        </button>
                      </div>
                    )}
                  </section>

                  {/* Tips */}
                  <section id="section-tips" className="mt-10 md:mt-14 w-full">
                    <h2 className="font-hk-grotesk text-h3-mobile md:text-h3-desktop text-midnight">Tips</h2>
                    {tipFields.length > 0 ? (
                      <>
                        <SortableList ids={(tipFields as any[]).map((f) => f.id)} strategy={rectSortingStrategy} onReorder={(a, b) => moveTip(a, b)}>
                        <ul className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                          {(tipFields as any[]).map((field, i) => {
                            const tip = tips?.[i];
                            const Icon = ICON_COMPONENTS[tip?.icon ?? "luggage"] ?? Luggage;
                            return (
                              <SortableItem key={field.id} id={field.id}>
                                {({ setNodeRef, style, handle }) => (
                              <li ref={setNodeRef} style={style} className="flex items-start gap-4 group/tip">
                                <Select value={tip?.icon ?? "luggage"} onValueChange={(v) => sv(`details.tips.${i}.icon`, v)}>
                                  <SelectTrigger className="flex size-12 shrink-0 items-center justify-center rounded-full bg-light-grey text-midnight border-0 p-0 [&>svg:last-child]:hidden hover:ring-2 hover:ring-crimson-red/20 transition-shadow"><Icon className="size-5 text-midnight" /></SelectTrigger>
                                  <SelectContent>{ALL_ICONS.map((k) => { const IC = ICON_COMPONENTS[k]; return <SelectItem key={k} value={k}><span className="flex items-center gap-2"><IC className="h-4 w-4" />{k}</span></SelectItem>; })}</SelectContent>
                                </Select>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start gap-2">
                                    <InlineInput value={tip?.title ?? ""} onChange={(v) => sv(`details.tips.${i}.title`, v)} placeholder="Title" className="font-hk-grotesk text-b2-desktop font-bold text-midnight flex-1" />
                                    <DragHandle handle={handle} className="opacity-0 group-hover/tip:opacity-100 transition-opacity mt-0.5" />
                                    <button type="button" onClick={() => rmTip(i)} className="text-crimson-red opacity-0 group-hover/tip:opacity-100 transition-opacity"><X className="h-4 w-4" /></button>
                                  </div>
                                  <InlineTextarea value={tip?.description ?? ""} onChange={(v) => sv(`details.tips.${i}.description`, v)} placeholder="Tip description…" className="mt-1 font-body text-b4-mobile md:text-b4-desktop text-dark-gray" />
                                </div>
                              </li>
                                )}
                              </SortableItem>
                            );
                          })}
                        </ul>
                        </SortableList>
                        <div className="mt-6 flex items-center gap-4">
                          <button type="button" onClick={() => (addTip as any)({ icon: "luggage", title: "", description: "" })}
                            className="flex items-center gap-1 font-body text-b4-desktop text-crimson-red hover:text-light-red">
                            <Plus className="h-4 w-4" /> Add tip
                          </button>
                          <button type="button" onClick={() => replaceTip(cloneTips())}
                            className="flex items-center gap-1 font-body text-b4-desktop text-dark-gray hover:text-midnight">
                            <RotateCcw className="h-4 w-4" /> Reset to default
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="mt-4 flex items-center gap-4">
                        <button type="button" onClick={() => (addTip as any)({ icon: "luggage", title: "", description: "" })}
                          className="flex items-center gap-1 font-body text-b4-desktop text-crimson-red hover:text-light-red">
                          <Plus className="h-4 w-4" /> Add tip
                        </button>
                        <button type="button" onClick={() => replaceTip(cloneTips())}
                          className="flex items-center gap-1 font-body text-b4-desktop text-dark-gray hover:text-midnight">
                          <RotateCcw className="h-4 w-4" /> Reset to default
                        </button>
                      </div>
                    )}
                  </section>

                </div>{/* end ONE main card */}
              </div>{/* end left column */}

              {/* ─── RIGHT COLUMN: BookingCard ───────────────────────────── */}
              <div className="mt-6 lg:mt-0 lg:sticky lg:top-34 self-start">
                <div className="overflow-hidden rounded-3xl bg-white shadow-medium">
                  {/* Duration + route */}
                  <div className="px-6 pb-5 pt-6 md:px-7 md:pt-7">
                    <InlineTextarea value={cardHeaderTitle} onChange={(v) => sv("cardHeaderTitle", v)} placeholder={durationLabel || "11 Day Tour"} className="font-hk-grotesk text-h5-mobile md:text-h5-desktop font-bold text-midnight w-full" />
                    <InlineTextarea value={cardSubHeader} onChange={(v) => sv("cardSubHeader", v)} placeholder="Destination" className="mt-1 font-body text-b2-mobile md:text-b1 text-dark-gray w-full" />
                  </div>

                  {/* Price */}
                  <div className="border-t border-light-grey px-6 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-body text-b4-desktop text-dark-gray">From</span>
                        <span className="font-body text-b4-desktop text-dark-gray">{sym}</span>
                        <span className="font-display text-h3-mobile text-midnight leading-none">
                          {pricing?.discounted || pricing?.original
                            ? Number(pricing?.discounted || pricing?.original).toLocaleString()
                            : "—"}
                        </span>
                      </div>
                      <button type="button" onClick={() => setPanelOpen(true)}
                        className="flex shrink-0 items-center gap-1 text-xs text-crimson-red hover:text-light-red">
                        <Pencil className="h-3 w-3" /> Edit Pricing
                      </button>
                    </div>
                  </div>

                  {/* Icon facts */}
                  <div className="px-6 pb-4">
                    <ul className="space-y-3">
                      <li className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-light-grey"><Calendar className="h-4 w-4 text-midnight" /></span>
                        <span className="font-body text-b4-desktop text-midnight">{cardHeaderTitle || durationLabel || "—"}</span>
                      </li>
                      <li className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-light-grey"><Route className="h-4 w-4 text-midnight" /></span>
                        <span className="font-body text-b4-desktop text-midnight">{cardSubHeader || "—"}</span>
                      </li>
                    </ul>
                  </div>

                  {/* CTA */}
                  <div className="border-t border-light-grey px-6 py-5 space-y-3">
                    <div data-field="stripePaymentLink" className="flex items-center gap-2 border border-border rounded-md px-3 py-1.5">
                      <ExternalLink className="h-3.5 w-3.5 text-dark-gray shrink-0" />
                      <InlineInput value={w("stripePaymentLink") ?? ""} onChange={(v) => sv("stripePaymentLink", v)} placeholder="Stripe payment link" className="font-body text-b4-desktop text-dark-gray" />
                    </div>
                    <div className="inline-flex w-full items-center justify-center rounded-full bg-crimson-red px-6 py-3.5 font-body font-bold text-white shadow-small pointer-events-none select-none">
                      Reserve Now
                    </div>
                    {/* Deposit notice (editable) */}
                    <div className="mt-2">
                      <InlineTextarea
                        value={gv("depositNote") ?? ""}
                        onChange={(v) => sv("depositNote", v)}
                        placeholder={depositAmt ? `Reserve for ${depositAmt} — deducted from total fees. Non-refundable.` : "Deposit notice text…"}
                        className="font-body text-b4-mobile text-dark-gray text-center"
                      />
                    </div>
                    {/* Footnote (editable) */}
                    <div>
                      <InlineInput
                        value={gv("footnote") ?? ""}
                        onChange={(v) => sv("footnote", v)}
                        placeholder="*Additional fees may apply"
                        className="font-body text-b4-mobile text-grey text-center"
                      />
                    </div>
                  </div>
                </div>
              </div>

            </div>{/* end two-column */}

            {/* ─── REVIEWS — full-width below two-column grid ──────────── */}
            <section id="section-reviews" className="mt-10 md:mt-14">
              <h2 className="font-hk-grotesk text-h3-mobile md:text-h3-desktop text-midnight">What people say about us</h2>

              {/* Empty state — greyed-out placeholder cards */}
              {reviewFields.length === 0 && (
                <>
                  <ul className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3 opacity-40 pointer-events-none select-none">
                    {PLACEHOLDER_REVIEWS.map((r, i) => (
                      <li key={i} className="rounded-2xl bg-white shadow-low p-6 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex gap-0.5">
                            {[1,2,3,4,5].map((n) => (
                              <span key={n} className="text-lg leading-none text-crimson-red">★</span>
                            ))}
                          </div>
                          <span className="font-body text-b5-desktop text-dark-gray">{r.date}</span>
                        </div>
                        <p className="font-body text-b4-desktop text-midnight">{r.body}</p>
                        <div className="flex items-center gap-3 pt-2">
                          <span className="size-10 shrink-0 overflow-hidden rounded-full bg-light-grey">
                            <img src={resolveImg(r.reviewerAvatar)} alt="" className="h-full w-full object-cover" />
                          </span>
                          <div>
                            <p className="font-body text-b4-desktop font-semibold text-midnight">{r.reviewerName}</p>
                            <p className="font-body text-b5-desktop text-crimson-red">{r.reviewerLocation}</p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 font-body text-b5-desktop text-dark-gray italic">
                    No reviews yet — generic placeholder cards shown on www.
                  </p>
                  <AddReviewMenu onAdd={(r) => (addReview as any)(r)} className="mt-4" />
                </>
              )}

              {/* Filled state — inline editable cards */}
              {reviewFields.length > 0 && (
                <>
                  <SortableList ids={(reviewFields as any[]).map((f) => f.id)} strategy={rectSortingStrategy} onReorder={(a, b) => moveReview(a, b)}>
                    <ul className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
                      {(reviewFields as any[]).map((field, i) => {
                        const review = reviews?.[i];
                        return (
                          <SortableItem key={field.id} id={field.id}>
                            {({ setNodeRef, style, handle }) => (
                              <li ref={setNodeRef} style={style} className="rounded-2xl bg-white shadow-low p-6 space-y-3 group/review">
                                <div className="flex items-center justify-between">
                                  <StarRatingInput
                                    value={review?.rating ?? 5}
                                    onChange={(v) => sv(`details.reviews.${i}.rating`, v)}
                                  />
                                  <div className="flex items-center gap-1">
                                    <MonthYearPicker
                                      value={review?.date ?? ""}
                                      onChange={(v) => sv(`details.reviews.${i}.date`, v)}
                                    />
                                    <DragHandle handle={handle} className="opacity-0 group-hover/review:opacity-100 transition-opacity" />
                                    <button type="button" onClick={() => rmReview(i)} className="text-crimson-red opacity-0 group-hover/review:opacity-100 transition-opacity">
                                      <X className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                                <InlineTextarea
                                  value={review?.body ?? ""}
                                  onChange={(v) => sv(`details.reviews.${i}.body`, v)}
                                  placeholder="Review text…"
                                  className="font-body text-b4-desktop text-midnight"
                                />
                                <div className="flex items-center gap-3 pt-2">
                                  <button
                                    type="button"
                                    onClick={() => setPickerState({ field: `review-${i}`, initialUrl: resolveImg(review?.reviewerAvatar) || undefined })}
                                    title={review?.reviewerAvatar ? "Change reviewer photo" : "Add reviewer photo"}
                                    className="group/avatar relative size-10 shrink-0 overflow-hidden rounded-full bg-light-grey"
                                  >
                                    {review?.reviewerAvatar ? (
                                      <img src={resolveImg(review.reviewerAvatar)} alt="" className="h-full w-full object-cover" />
                                    ) : null}
                                    <span className="absolute inset-0 flex items-center justify-center bg-midnight/40 opacity-0 transition-opacity group-hover/avatar:opacity-100">
                                      <ImageIcon className="h-4 w-4 text-white" />
                                    </span>
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <InlineInput
                                      value={review?.reviewerName ?? ""}
                                      onChange={(v) => sv(`details.reviews.${i}.reviewerName`, v)}
                                      placeholder="Reviewer name"
                                      className="font-body text-b4-desktop font-semibold text-midnight"
                                    />
                                    <InlineInput
                                      value={review?.reviewerLocation ?? ""}
                                      onChange={(v) => sv(`details.reviews.${i}.reviewerLocation`, v)}
                                      placeholder="City, Country"
                                      className="font-body text-b5-desktop text-crimson-red"
                                    />
                                  </div>
                                </div>
                              </li>
                            )}
                          </SortableItem>
                        );
                      })}
                    </ul>
                  </SortableList>
                  <AddReviewMenu onAdd={(r) => (addReview as any)(r)} className="mt-6" />
                </>
              )}
            </section>

          </div>{/* end page container */}
        </form>

        <TourSettingsPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          form={form}
          tour={tour ?? null}
        />

        <SlugChangeModal
          open={!!slugModal}
          oldSlug={slugModal?.oldSlug ?? ""}
          proposedSlug={slugModal?.proposedSlug ?? ""}
          onCancel={() => setSlugModal(null)}
          onConfirm={confirmSlugChange}
        />

        <HeroSetupPanel
          open={heroPanelOpen}
          onClose={() => setHeroPanelOpen(false)}
          form={form}
          coverImageUrl={resolveImg(uploadedCover) || undefined}
          onEditCover={() => setPickerState({ field: "cover", initialUrl: resolveImg(uploadedCover) || undefined })}
          onRemoveCover={() => {
            if (uploadedCover?.startsWith("blob:")) revokeBlobUrl(uploadedCover);
            setUploadedCover(null);
            setCoverBlob(null);
          }}
        />

        <TravelDatesModal
          open={datesModalOpen}
          onClose={() => setDatesModalOpen(false)}
          form={form}
        />
      </Form>

      {/* ── Image Picker Modal ─────────────────────────────────────────── */}
      {pickerState && (
        <ImagePickerModal
          open
          onClose={() => setPickerState(null)}
          onConfirm={handlePickerConfirm}
          storageFolder={slug ? `images/tours/${slug}` : "images/tours"}
          aspectRatio={
            pickerState.field === "cover"
              ? 16 / 9
              : pickerState.field.startsWith("itinerary-")
              ? 16 / 10
              : pickerState.field.startsWith("review-")
              ? 1
              : 4 / 3
          }
          multiple={pickerState.multiple ?? false}
          initialImageUrl={pickerState.initialUrl}
          title={
            pickerState.field === "cover"
              ? "Select Hero Image"
              : pickerState.field === "gallery-add"
              ? "Add Gallery Images"
              : pickerState.field.startsWith("gallery-edit-")
              ? "Edit Gallery Image"
              : pickerState.field.startsWith("highlight-")
              ? "Select Highlight Image"
              : pickerState.field.startsWith("accommodation-")
              ? "Select Accommodation Image"
              : pickerState.field.startsWith("review-")
              ? "Select Reviewer Photo"
              : "Select Day Image"
          }
        />
      )}

      {/* ── Reset confirmation ─────────────────────────────────────────── */}
      <ResetChangesModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleResetConfirm}
      />

      {/* ── Leave-with-unsaved-changes confirmation ────────────────────── */}
      <ConfirmLeaveModal
        open={leaveGuard.isPending}
        onClose={leaveGuard.cancel}
        onConfirm={leaveGuard.confirm}
      />

    </div>
  );
}
