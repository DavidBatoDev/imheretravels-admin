"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, query } from "firebase/firestore";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { db } from "@/lib/firebase";
import { uploadFile, STORAGE_BUCKET } from "@/utils/file-upload";
import {
  subscribeToReviews,
  setReviewStatus,
  deleteReview,
  updateReviewPhotos,
  createAdminReview,
  updateReview,
  assignReviewTour,
  verifyAdminBooking,
  tourNamesLooselyMatch,
  type BookingCheckMatch,
} from "@/services/reviews-service";
import type { ReviewDoc, CategoryRatings } from "@/types/reviews";
import { isExternalSource, REVIEW_CATEGORIES } from "@/types/reviews";
import MarkdownEditor from "./MarkdownEditor";
import DisplayDatePicker, { formatDisplayDate } from "./DisplayDatePicker";
import NationalitySelect from "./NationalitySelect";
import { getNationalityOptions } from "@/app/reservation-booking-form/utils/nationalityUtils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  Star, MoreHorizontal, Eye, EyeOff, Trash2, ImagePlus, X, Plus, Search,
  BadgeCheck, Loader2, Pencil, ExternalLink, ChevronDown, ChevronUp, FilterX,
  Smile, MapPin, Play,
} from "lucide-react";

/** Matches the public site's write-review form (WriteReviewButton.tsx). */
const FORM_LABEL_CLS = "mb-1.5 block font-hk-grotesk text-h6-desktop font-bold text-midnight";
const FORM_INPUT_CLS =
  "rounded-md border border-light-grey bg-white px-4 py-3 font-body text-b2-desktop text-midnight outline-none focus-visible:ring-0 focus:border-crimson-red placeholder:text-grey";

/** Human-readable reasons for a failed booking check (mirrors www/app/api/reviews/verify/route.ts). */
const BOOKING_CHECK_REASONS: Record<string, string> = {
  not_found: "No booking found with that email or booking ID.",
  not_confirmed: "That booking isn't confirmed or completed yet.",
};

const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

type TourOption = { id: string; slug: string; name: string };
type PendingPhoto = { id: string; file: File; previewUrl: string };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DISPLAY_DATE_NONE = "__none";

/** Recent-first "{Month} {Year}" options for review display dates. */
function displayDateOptions(): string[] {
  const current = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => current + 1 - i);
  return years.flatMap((year) => [...MONTHS].reverse().map((month) => `${month} ${year}`));
}

const REVIEW_EMOJIS = [
  "\u{1F600}", "\u{1F60D}", "\u{1F970}", "\u{1F60E}", "\u{1F929}", "\u{1F64C}",
  "\u{1F44D}", "\u2764\uFE0F", "\u{1F525}", "\u2728", "\u{1F334}", "\u{1F3DD}\uFE0F",
  "\u{1F30A}", "\u26F0\uFE0F", "\u{1F305}", "\u{1F4F8}", "\u2708\uFE0F", "\u{1F389}",
  "\u{1F64F}", "\u{1F4AF}",
];

/** Emoji picker that inserts at the textarea's current cursor position. */
function EmojiPickerButton({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}) {
  function insert(emoji: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      const cursor = start + emoji.length;
      el?.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
          <Smile className="h-3.5 w-3.5" /> Emoji
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <div className="grid grid-cols-10 gap-1">
          {REVIEW_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => insert(e)}
              className="rounded p-1 text-lg leading-none hover:bg-muted"
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex text-crimson-red">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < n ? "fill-current" : "fill-muted stroke-muted-foreground"}`}
        />
      ))}
    </span>
  );
}

/** Compact interactive 5-star picker (used for category ratings in both dialogs). */
function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = (hover || value) >= n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(value === n ? 0 : n)}
            className="p-0.5"
          >
            <Star
              className={`h-5 w-5 transition-colors ${
                active ? "fill-crimson-red text-crimson-red" : "fill-transparent text-muted-foreground"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Optional per-category star inputs (Guide / Experience / …). */
function CategoryStarInputs({
  value,
  onChange,
}: {
  value: CategoryRatings;
  onChange: (v: CategoryRatings) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">
        Category ratings <span className="font-normal text-muted-foreground">(optional)</span>
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        {REVIEW_CATEGORIES.map((cat) => (
          <div key={cat.key} className="flex items-center justify-between gap-2">
            <span className="text-sm text-foreground">{cat.label}</span>
            <StarPicker
              value={value[cat.key] ?? 0}
              onChange={(n) => {
                const next = { ...value };
                if (n) next[cat.key] = n;
                else delete next[cat.key];
                onChange(next);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Faithful port of the public site's `Stars` (www/app/components/reviews/Stars.tsx). */
function CardStars({ count }: { count: number }) {
  const rounded = Math.max(0, Math.min(5, Math.round(count)));
  return (
    <div className="flex gap-0.5 text-crimson-red" aria-label={`${rounded} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          viewBox="0 0 20 20"
          className={`size-4 ${i < rounded ? "fill-current" : "fill-light-grey"}`}
        >
          <path d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9z" />
        </svg>
      ))}
    </div>
  );
}

function DisplayDateSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const options = useMemo(displayDateOptions, []);

  return (
    <Select
      value={value || DISPLAY_DATE_NONE}
      onValueChange={(next) => onChange(next === DISPLAY_DATE_NONE ? "" : next)}
    >
      <SelectTrigger className="bg-background">
        <SelectValue placeholder="Select display date" />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={DISPLAY_DATE_NONE}>No display date</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const MARKDOWN_PROSE_CLASSNAME = [
  "font-body text-b2-mobile md:text-b2-desktop text-midnight",
  "[&_p]:my-0 [&_p+p]:mt-3",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:mt-1",
  "[&_a]:text-crimson-red [&_a]:underline",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-light-grey [&_blockquote]:pl-4 [&_blockquote]:text-grey",
  "[&_strong]:font-bold",
  "[&_h3]:font-hk-grotesk [&_h3]:text-h6-desktop [&_h3]:font-bold [&_h3]:mt-3",
  "[&_h4]:font-hk-grotesk [&_h4]:font-bold [&_h4]:mt-3",
].join(" ");

const MARKDOWN_ALLOWED = ["p", "br", "strong", "em", "del", "a", "ul", "ol", "li", "blockquote", "code", "h3", "h4"];

const PREVIEW_PHOTO_COUNT = 3; // matches ReviewPhotos' preview-mode thumbnail cap

/**
 * Draft-data render of the public site's review card
 * (www/app/components/reviews/ReviewCard.tsx) — same brand tokens, type scale
 * and layout, adapted to take the create form's in-progress field values
 * instead of a saved `PublicReview`.
 */
function ReviewPreview({
  tourName,
  rating,
  firstName,
  location,
  title,
  body,
  displayDate,
  photos,
}: {
  tourName?: string;
  rating: number;
  firstName: string;
  location: string;
  title: string;
  body: string;
  displayDate: string;
  photos: string[];
}) {
  const reviewBody = body.trim() || "Your review will appear here as you write.";
  const date =
    displayDate.trim() ||
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(
      new Date(),
    );
  const shownPhotos = photos.slice(0, PREVIEW_PHOTO_COUNT);
  const overflow = photos.length - shownPhotos.length;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Live preview
        </p>
        <p className="text-sm text-muted-foreground">This mirrors the public review card.</p>
      </div>

      <div className="flex flex-col gap-5 rounded-lg bg-white p-8 shadow-small">
        <div className="flex items-center justify-between gap-3">
          <CardStars count={rating} />
          <span className="font-body text-b4-desktop text-grey">{date}</span>
        </div>

        {title.trim() && (
          <p className="-mb-2 font-hk-grotesk text-h6-desktop font-bold text-midnight">
            {title.trim()}
          </p>
        )}

        <div className={MARKDOWN_PROSE_CLASSNAME}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} allowedElements={MARKDOWN_ALLOWED}>
            {reviewBody}
          </ReactMarkdown>
        </div>

        {shownPhotos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {shownPhotos.map((url, i) => (
              <div key={url} className="relative aspect-square w-full overflow-hidden rounded-sm bg-light-grey">
                <img src={url} alt="" className="size-full object-cover" />
                {overflow > 0 && i === shownPhotos.length - 1 && (
                  <span className="absolute inset-0 flex items-center justify-center bg-midnight/60 font-hk-grotesk text-h6-desktop font-bold text-white">
                    +{overflow}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {tourName && (
          <p className="font-body text-b4-desktop text-crimson-red underline">{tourName}</p>
        )}

        <div className="mt-auto flex items-center gap-4 pt-2">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-light-grey font-hk-grotesk text-h6-desktop font-bold text-midnight">
            {(firstName.trim() || "Reviewer").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-hk-grotesk text-h6-desktop font-bold text-midnight">
              {firstName.trim() || "Reviewer"}
            </p>
            {location.trim() && (
              <p className="font-body text-b4-desktop text-vivid-orange">{location.trim()}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  published: "default",
  hidden: "secondary",
  pending: "outline",
};

const SOURCE_LABEL: Record<string, string> = {
  user: "Verified booking",
  admin: "Admin-added",
  google: "via Google",
  tourradar: "via TourRadar",
};

const UNASSIGNED_FILTER = "__unassigned";

const WEBSITE_URL = process.env.NEXT_PUBLIC_WEBSITE_URL || "";

export default function ReviewsList() {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [tours, setTours] = useState<TourOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tourFilter, setTourFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  const [toDelete, setToDelete] = useState<ReviewDoc | null>(null);
  const [toEdit, setToEdit] = useState<ReviewDoc | null>(null);
  const [toAssign, setToAssign] = useState<ReviewDoc | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Add-photos wiring: a hidden file input targeted at one review.
  const fileRef = useRef<HTMLInputElement | null>(null);
  const photoTarget = useRef<ReviewDoc | null>(null);

  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const unsub = subscribeToReviews(
      (rows) => {
        setReviews(rows);
        setLoading(false);
      },
      (err) => {
        toast({ title: "Failed to load reviews", description: err.message, variant: "destructive" });
        setLoading(false);
      },
    );
    return () => unsub();
  }, [toast]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "tourPackages")));
        const opts = snap.docs
          .map((d) => {
            const data = d.data() as any;
            return { id: d.id, slug: data.slug ?? d.id, name: data.name ?? data.title ?? d.id };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        setTours(opts);
      } catch {
        /* non-fatal — create dialog just won't list tours */
      }
    })();
  }, []);

  const tourNames = useMemo(() => {
    const set = new Map<string, string>();
    reviews.forEach((r) => r.tourSlug && set.set(r.tourSlug, r.tourName || r.tourSlug));
    return Array.from(set, ([slug, name]) => ({ slug, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [reviews]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reviews.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
      if (tourFilter === UNASSIGNED_FILTER) {
        if (r.tourSlug) return false;
      } else if (tourFilter !== "all" && r.tourSlug !== tourFilter) {
        return false;
      }
      if (!term) return true;
      return (
        r.reviewerFirstName.toLowerCase().includes(term) ||
        r.bodyMarkdown.toLowerCase().includes(term) ||
        (r.tourName || "").toLowerCase().includes(term)
      );
    });
  }, [reviews, search, statusFilter, tourFilter, sourceFilter]);

  const hasActiveFilters =
    search.trim() !== "" ||
    statusFilter !== "all" ||
    tourFilter !== "all" ||
    sourceFilter !== "all";

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setTourFilter("all");
    setSourceFilter("all");
  }

  const counts = useMemo(() => {
    return {
      total: reviews.length,
      published: reviews.filter((r) => r.status === "published").length,
      hidden: reviews.filter((r) => r.status === "hidden").length,
    };
  }, [reviews]);

  async function toggleHidden(r: ReviewDoc) {
    const next = r.status === "hidden" ? "published" : "hidden";
    setBusyId(r.id);
    try {
      await setReviewStatus(r.id, next, r.tourSlug);
      toast({ title: next === "hidden" ? "Review hidden" : "Review published" });
    } catch (e) {
      toast({ title: "Update failed", description: String(e), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setBusyId(toDelete.id);
    try {
      await deleteReview(toDelete.id, toDelete.tourSlug);
      toast({ title: "Review deleted" });
    } catch (e) {
      toast({ title: "Delete failed", description: String(e), variant: "destructive" });
    } finally {
      setBusyId(null);
      setToDelete(null);
    }
  }

  function triggerAddPhotos(r: ReviewDoc) {
    photoTarget.current = r;
    fileRef.current?.click();
  }

  async function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const target = photoTarget.current;
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!target || !files.length) return;
    setBusyId(target.id);
    try {
      const urls: string[] = [];
      const failures: string[] = [];
      for (const file of files) {
        const res = await uploadFile(file, {
          bucket: STORAGE_BUCKET,
          folder: `review-photos/${target.tourId || "admin"}`,
          maxSize: 8 * 1024 * 1024,
          allowedTypes: ALLOWED,
          generateUniqueName: true,
        });
        if (res.success && res.data) urls.push(res.data.publicUrl);
        else failures.push(`${file.name}: ${res.error ?? "upload failed"}`);
      }
      if (urls.length) {
        const next = [...(target.photos ?? []), ...urls];
        await updateReviewPhotos(target.id, next, target.tourSlug);
        toast({ title: `Added ${urls.length} photo${urls.length === 1 ? "" : "s"}` });
      }
      if (failures.length) {
        toast({
          title: `${failures.length} photo${failures.length === 1 ? "" : "s"} failed to upload`,
          description: failures.join("; "),
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({ title: "Upload failed", description: String(err), variant: "destructive" });
    } finally {
      setBusyId(null);
      photoTarget.current = null;
    }
  }

  async function removePhoto(r: ReviewDoc, url: string) {
    setBusyId(r.id);
    try {
      await updateReviewPhotos(r.id, (r.photos ?? []).filter((p) => p !== url), r.tourSlug);
    } catch (e) {
      toast({ title: "Update failed", description: String(e), variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Hidden file input for add-photos */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onFilesPicked}
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-sm xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search quote, name, or tour…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 bg-background pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-full bg-background sm:w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="h-10 w-full bg-background sm:w-44">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="user">Verified booking</SelectItem>
              <SelectItem value="admin">Admin-added</SelectItem>
              <SelectItem value="google">via Google</SelectItem>
              <SelectItem value="tourradar">via TourRadar</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tourFilter} onValueChange={setTourFilter}>
            <SelectTrigger className="h-10 w-full bg-background sm:w-56">
              <SelectValue placeholder="Tour" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tours</SelectItem>
              <SelectItem value={UNASSIGNED_FILTER}>Unassigned</SelectItem>
              {tourNames.map((t) => (
                <SelectItem key={t.slug} value={t.slug}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="h-10 shrink-0">
              <FilterX className="mr-2 h-4 w-4" /> Clear filters
            </Button>
          )}
        </div>
        <Button onClick={() => setCreateOpen(true)} className="h-10 shrink-0 self-start xl:self-auto">
          <Plus className="mr-2 h-4 w-4" /> Add review
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span>{counts.total} total</span>
        <span>{counts.published} published</span>
        <span>{counts.hidden} hidden</span>
        {hasActiveFilters && (
          <span className="text-xs">
            Showing {filtered.length} of {counts.total}
          </span>
        )}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[1120px] table-fixed">
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[36%] min-w-[320px] px-4 py-3 text-left">Review</TableHead>
                  <TableHead className="w-[15%] px-4 py-3 text-left">Reviewer</TableHead>
                  <TableHead className="w-[16%] px-4 py-3 text-left">Tour</TableHead>
                  <TableHead className="w-[10%] px-4 py-3 text-left">Rating</TableHead>
                  <TableHead className="w-[10%] px-4 py-3 text-left">Status</TableHead>
                  <TableHead className="w-[10%] px-4 py-3 text-left">Date</TableHead>
                  <TableHead className="w-[72px] px-4 py-3 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      No reviews found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id} className={r.status === "hidden" ? "opacity-70" : ""}>
                      <TableCell className="px-4 py-3 align-top">
                        {r.title && <p className="font-semibold leading-5">{r.title}</p>}
                        <p
                          className={`max-w-md whitespace-pre-wrap text-sm text-muted-foreground ${
                            expanded.has(r.id) ? "" : "line-clamp-3"
                          }`}
                        >
                          {r.bodyMarkdown}
                        </p>
                        {r.bodyMarkdown.length > 180 && (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(r.id)}
                            className="mt-0.5 inline-flex items-center gap-0.5 text-xs font-medium text-crimson-red hover:underline"
                          >
                            {expanded.has(r.id) ? (
                              <>
                                Show less <ChevronUp className="h-3 w-3" />
                              </>
                            ) : (
                              <>
                                Show more <ChevronDown className="h-3 w-3" />
                              </>
                            )}
                          </button>
                        )}
                        {r.photos && r.photos.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {r.photos.map((url) => (
                              <span key={url} className="group relative">
                                <a href={url} target="_blank" rel="noreferrer">
                                  <img
                                    src={url}
                                    alt=""
                                    className="h-14 w-14 rounded object-cover ring-1 ring-border transition group-hover:opacity-80"
                                  />
                                </a>
                                <button
                                  type="button"
                                  aria-label="Remove photo"
                                  onClick={() => removePhoto(r, url)}
                                  disabled={busyId === r.id}
                                  className="absolute -right-1.5 -top-1.5 rounded-full bg-background p-1 shadow ring-1 ring-border hover:bg-destructive hover:text-destructive-foreground"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        {r.videos && r.videos.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {r.videos.map((v) => (
                              <a
                                key={v.src}
                                href={v.src}
                                target="_blank"
                                rel="noreferrer"
                                title="Play video"
                                className="group relative block h-14 w-14 overflow-hidden rounded ring-1 ring-border"
                              >
                                {v.poster ? (
                                  <img src={v.poster} alt="" className="h-full w-full object-cover transition group-hover:opacity-80" />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center bg-muted" />
                                )}
                                <span className="absolute inset-0 flex items-center justify-center">
                                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white">
                                    <Play className="h-3.5 w-3.5 fill-current" />
                                  </span>
                                </span>
                              </a>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top">
                        <div className="flex items-center gap-1 font-medium">
                          {r.reviewerFirstName}
                          {r.verified && (
                            <BadgeCheck className="h-3.5 w-3.5 text-green-600" aria-label="Verified" />
                          )}
                        </div>
                        {r.reviewerLocation && (
                          <p className="text-xs text-muted-foreground">{r.reviewerLocation}</p>
                        )}
                        <Badge variant="outline" className="mt-1 text-[10px] font-normal">
                          {SOURCE_LABEL[r.source] ?? r.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top text-sm">
                        {r.tourName || (
                          <span className="text-xs italic text-muted-foreground">
                            {isExternalSource(r.source) ? "Unassigned" : "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top">
                        <Stars n={r.rating} />
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top">
                        <Badge variant={STATUS_VARIANT[r.status] ?? "outline"} className="capitalize">
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 align-top text-sm text-muted-foreground">
                        {r.displayDate ||
                          (r.createdAt
                            ? new Date(r.createdAt).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "—")}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right align-top">
                        <div className="flex items-center justify-end gap-1.5">
                        {WEBSITE_URL && (
                          <Button
                            asChild
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 bg-background"
                            title="View on site"
                          >
                            <a
                              href={`${WEBSITE_URL}${r.tourSlug ? `/tours/${r.tourSlug}` : "/reviews"}`}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`View ${r.reviewerFirstName}'s review on site`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              disabled={busyId === r.id}
                              className="h-8 w-8 bg-background"
                              aria-label={`Review actions for ${r.reviewerFirstName}`}
                            >
                              {busyId === r.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setToEdit(r)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            {isExternalSource(r.source) && (
                              <DropdownMenuItem onClick={() => setToAssign(r)}>
                                <MapPin className="mr-2 h-4 w-4" /> Assign to tour
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => toggleHidden(r)}>
                              {r.status === "hidden" ? (
                                <>
                                  <Eye className="mr-2 h-4 w-4" /> Publish
                                </>
                              ) : (
                                <>
                                  <EyeOff className="mr-2 h-4 w-4" /> Hide
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => triggerAddPhotos(r)}>
                              <ImagePlus className="mr-2 h-4 w-4" /> Add photos
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setToDelete(r)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <CreateReviewDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tours={tours}
        onCreated={() => toast({ title: "Review added" })}
      />

      <EditReviewDialog
        review={toEdit}
        onOpenChange={(o) => !o && setToEdit(null)}
        onSaved={() => toast({ title: "Review updated" })}
      />

      <AssignTourDialog
        review={toAssign}
        tours={tours}
        onOpenChange={(o) => !o && setToAssign(null)}
        onAssigned={() => toast({ title: "Tour assignment updated" })}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this review?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the review from the site. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const HUB_ONLY = "__hub";

/**
 * Assigns an external (Google) review to a tour, or marks it hub-only. This is
 * the sanctioned path for placing a federated review on a tour page — the Edit
 * dialog deliberately can't change the tour.
 */
function AssignTourDialog({
  review,
  tours,
  onOpenChange,
  onAssigned,
}: {
  review: ReviewDoc | null;
  tours: TourOption[];
  onOpenChange: (o: boolean) => void;
  onAssigned: () => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState<string>(HUB_ONLY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (review) setValue(review.tourSlug || HUB_ONLY);
  }, [review]);

  async function save() {
    if (!review) return;
    setSaving(true);
    try {
      const tour = value === HUB_ONLY ? null : tours.find((t) => t.slug === value) ?? null;
      await assignReviewTour(review.id, tour, review.tourSlug || undefined);
      onAssigned();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Failed to assign tour", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!review} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign to a tour</DialogTitle>
          <DialogDescription>
            Place this external review on a tour page, or keep it on the community
            reviews hub only. It won&apos;t count toward the tour&apos;s star average.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <label className="mb-1.5 block text-sm font-medium">Tour</label>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Select a tour" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={HUB_ONLY}>Community hub only</SelectItem>
              {tours.map((t) => (
                <SelectItem key={t.slug} value={t.slug}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateReviewDialog({
  open,
  onOpenChange,
  tours,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tours: TourOption[];
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [tourSlug, setTourSlug] = useState("");
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [categoryRatings, setCategoryRatings] = useState<CategoryRatings>({});
  const [firstName, setFirstName] = useState("");
  const [nationality, setNationality] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [displayDateISO, setDisplayDateISO] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const photosRef = useRef<PendingPhoto[]>([]);
  const selectedTour = tours.find((t) => t.slug === tourSlug);
  const previewPhotos = photos.map((photo) => photo.previewUrl);
  const displayDate = displayDateISO ? formatDisplayDate(displayDateISO) : "";
  const nationalityOptions = useMemo(() => getNationalityOptions(), []);

  const [bookingIdentifier, setBookingIdentifier] = useState("");
  const [bookingCheckState, setBookingCheckState] = useState<"idle" | "checking" | "verified" | "error">("idle");
  const [bookingCheckMessage, setBookingCheckMessage] = useState("");
  const [verifiedBooking, setVerifiedBooking] = useState<{ bookingId: string; bookingCode: string } | null>(null);
  const [bookingChoices, setBookingChoices] = useState<BookingCheckMatch[] | null>(null);

  function applyBookingMatch(match: BookingCheckMatch) {
    // Exact match first — tour names often overlap ("Philippine Sunset" vs.
    // "Philippine Sunset (with Jess)"), and loose substring matching alone
    // would grab whichever overlapping tour happens to sort first.
    const exact = tours.find((t) => t.name.trim().toLowerCase() === match.tourName.trim().toLowerCase());
    const found = exact ?? tours.find((t) => tourNamesLooselyMatch(t.name, match.tourName));
    if (found) setTourSlug(found.slug);
    setVerifiedBooking({ bookingId: match.bookingId, bookingCode: match.bookingCode });
    setBookingCheckState("verified");
    setBookingCheckMessage(
      found
        ? `Confirmed booking — ${match.firstName || "traveler"} · ${found.name}`
        : `Confirmed booking — ${match.firstName || "traveler"} · ${match.tourName} (no matching tour package — select manually)`,
    );
    if (!firstName.trim() && match.firstName) setFirstName(match.firstName);
    if (!nationality && match.nationality) setNationality(match.nationality);
    setBookingChoices(null);
  }

  async function checkBooking() {
    const identifier = bookingIdentifier.trim();
    if (!identifier) return;
    setBookingCheckState("checking");
    setBookingChoices(null);
    try {
      const result = await verifyAdminBooking({ identifier });
      if (!result.ok) {
        setBookingCheckState("error");
        setBookingCheckMessage(BOOKING_CHECK_REASONS[result.reason] ?? "Booking check failed.");
        setVerifiedBooking(null);
        return;
      }
      if (result.matches.length === 1) {
        applyBookingMatch(result.matches[0]);
      } else {
        setBookingChoices(result.matches);
        setBookingCheckState("idle");
        setBookingCheckMessage("");
      }
    } catch (e) {
      setBookingCheckState("error");
      setBookingCheckMessage(String(e));
      setVerifiedBooking(null);
    }
  }

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    return () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    };
  }, []);

  function clearPhotos() {
    photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    photosRef.current = [];
    setPhotos([]);
  }

  function reset() {
    setTourSlug("");
    setRating(5);
    setCategoryRatings({});
    setFirstName("");
    setNationality("");
    setTitle("");
    setBody("");
    setDisplayDateISO("");
    setBookingIdentifier("");
    setBookingCheckState("idle");
    setBookingCheckMessage("");
    setVerifiedBooking(null);
    setBookingChoices(null);
    clearPhotos();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !saving) reset();
    onOpenChange(nextOpen);
  }

  function onPendingPhotosPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    const accepted: PendingPhoto[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      if (!ALLOWED.includes(file.type)) {
        rejected.push(file.name);
        continue;
      }
      accepted.push({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    setPhotos((prev) => {
      const room = Math.max(0, 6 - prev.length);
      const next = [...prev, ...accepted.slice(0, room)];
      accepted.slice(room).forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      if (accepted.length > room) {
        toast({ title: "Photo limit reached", description: "Add up to 6 tour pictures per review." });
      }
      return next;
    });

    if (rejected.length) {
      toast({
        title: "Some photos were skipped",
        description: rejected.join(", "),
        variant: "destructive",
      });
    }
  }

  function removePendingPhoto(id: string) {
    setPhotos((prev) => {
      const removed = prev.find((photo) => photo.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((photo) => photo.id !== id);
    });
  }

  async function submit() {
    const tour = selectedTour;
    if (!tour) return toast({ title: "Choose a tour", variant: "destructive" });
    if (!firstName.trim()) return toast({ title: "Enter a first name", variant: "destructive" });
    if (body.trim().length < 4) return toast({ title: "Write a review body", variant: "destructive" });

    setSaving(true);
    try {
      const uploadedPhotos: string[] = [];
      for (const photo of photos) {
        const res = await uploadFile(photo.file, {
          bucket: STORAGE_BUCKET,
          folder: `review-photos/${tour.id || "admin"}`,
          maxSize: 8 * 1024 * 1024,
          allowedTypes: ALLOWED,
          generateUniqueName: true,
        });
        if (!res.success || !res.data) {
          throw new Error(`${photo.file.name}: ${res.error ?? "upload failed"}`);
        }
        uploadedPhotos.push(res.data.publicUrl);
      }

      await createAdminReview({
        tourId: tour.id,
        tourSlug: tour.slug,
        tourName: tour.name,
        rating,
        categoryRatings: Object.keys(categoryRatings).length ? categoryRatings : undefined,
        title: title.trim() || undefined,
        bodyMarkdown: body.trim(),
        reviewerFirstName: firstName.trim(),
        reviewerLocation: nationality || undefined,
        photos: uploadedPhotos,
        displayDate: displayDate || undefined,
        bookingId: verifiedBooking?.bookingId,
        bookingCode: verifiedBooking?.bookingCode,
        verified: !!verifiedBooking,
      });
      onCreated();
      reset();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Failed to add review", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideClose
        className="grid max-h-[92vh] w-[calc(100vw-2rem)] max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-lg bg-white p-0 shadow-xlarge"
      >
        <DialogClose
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-2 text-midnight shadow-small backdrop-blur transition-opacity hover:bg-light-grey focus:outline-none focus:ring-2 focus:ring-crimson-red disabled:pointer-events-none"
        >
          <X className="size-5" />
        </DialogClose>
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <DialogTitle className="font-hk-grotesk text-h4-desktop text-midnight">Add a review</DialogTitle>
          <DialogDescription className="font-body text-b4-desktop text-grey">
            {verifiedBooking
              ? "Create an admin-authored review. It publishes immediately as a verified review."
              : "Create an admin-authored review. It publishes immediately (unverified)."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-h-0 overflow-y-auto px-6 py-5">
            <div className="space-y-4">
              <div>
                <label className={FORM_LABEL_CLS}>
                  Booking email or ID <span className="font-normal text-grey">(optional)</span>
                </label>
                <div className="flex gap-2">
                  <Input
                    value={bookingIdentifier}
                    onChange={(e) => {
                      setBookingIdentifier(e.target.value);
                      setBookingCheckState("idle");
                      setBookingCheckMessage("");
                      setVerifiedBooking(null);
                      setBookingChoices(null);
                    }}
                    className={FORM_INPUT_CLS}
                    placeholder="you@email.com or booking ID"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={checkBooking}
                    disabled={!bookingIdentifier.trim() || bookingCheckState === "checking"}
                    className="shrink-0 rounded-md border-light-grey px-4"
                  >
                    {bookingCheckState === "checking" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Check"
                    )}
                  </Button>
                </div>
                {bookingCheckState === "verified" && (
                  <p className="mt-1.5 flex items-center gap-1.5 font-body text-b4-desktop text-spring-green">
                    <BadgeCheck className="size-4" /> {bookingCheckMessage}
                  </p>
                )}
                {bookingCheckState === "error" && (
                  <p className="mt-1.5 font-body text-b4-desktop text-crimson-red">{bookingCheckMessage}</p>
                )}
                {bookingChoices && bookingChoices.length > 1 && (
                  <div className="mt-2">
                    <label className={`${FORM_LABEL_CLS} mb-1`}>
                      This traveler has confirmed bookings for {bookingChoices.length} tours — which one?
                    </label>
                    <Select onValueChange={(tourName) => {
                      const match = bookingChoices.find((m) => m.tourName === tourName);
                      if (match) applyBookingMatch(match);
                    }}>
                      <SelectTrigger className={FORM_INPUT_CLS}>
                        <SelectValue placeholder="Select the tour this review is for" />
                      </SelectTrigger>
                      <SelectContent>
                        {bookingChoices.map((m) => (
                          <SelectItem key={m.tourName} value={m.tourName}>
                            {m.tourName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div>
                <label className={FORM_LABEL_CLS}>Tour</label>
                <Select value={tourSlug} onValueChange={setTourSlug}>
                  <SelectTrigger className={FORM_INPUT_CLS}>
                    <SelectValue placeholder="Select a tour" />
                  </SelectTrigger>
                  <SelectContent>
                    {tours.map((t) => (
                      <SelectItem key={t.slug} value={t.slug}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className={FORM_LABEL_CLS}>Your rating</label>
                <div className="flex gap-1" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const active = (hoverRating || rating) >= n;
                    return (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={rating === n}
                        aria-label={`${n} star${n > 1 ? "s" : ""}`}
                        onMouseEnter={() => setHoverRating(n)}
                        onMouseLeave={() => setHoverRating(0)}
                        onClick={() => setRating(n)}
                        className="p-0.5"
                      >
                        <Star
                          className={`size-8 transition-colors ${
                            active ? "fill-crimson-red text-crimson-red" : "fill-transparent text-grey"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              <CategoryStarInputs value={categoryRatings} onChange={setCategoryRatings} />

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={FORM_LABEL_CLS}>First name</label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={FORM_INPUT_CLS}
                    placeholder="Jamie"
                  />
                </div>
                <div>
                  <label className={FORM_LABEL_CLS}>
                    Nationality <span className="font-normal text-grey">(optional)</span>
                  </label>
                  <NationalitySelect
                    value={nationality || null}
                    onChange={setNationality}
                    options={nationalityOptions}
                    placeholder="Select nationality"
                    ariaLabel="Nationality"
                    searchable
                  />
                </div>
              </div>

              <div>
                <label className={FORM_LABEL_CLS}>
                  Headline <span className="font-normal text-grey">(optional)</span>
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={FORM_INPUT_CLS}
                  placeholder="Unforgettable island hopping"
                  maxLength={120}
                />
              </div>

              <div>
                <label className={`${FORM_LABEL_CLS} after:ml-0.5 after:text-crimson-red after:content-['*']`}>
                  Your review
                </label>
                <MarkdownEditor
                  value={body}
                  onChange={setBody}
                  placeholder="Share the travel moment, guide highlight, or favorite stop…"
                  highlighted
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLS}>
                  Tour pictures <span className="font-normal text-grey">(up to 6)</span>
                </label>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {Array.from({ length: 6 }).map((_, i) => {
                    const photo = photos[i];
                    if (photo) {
                      return (
                        <div
                          key={photo.id}
                          className="group relative aspect-square overflow-hidden rounded-md bg-light-grey"
                        >
                          <img src={photo.previewUrl} alt="" className="size-full object-cover" />
                          <button
                            type="button"
                            aria-label="Remove photo"
                            onClick={() => removePendingPhoto(photo.id)}
                            className="absolute right-1 top-1 rounded-full bg-midnight/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      );
                    }
                    const isNextSlot = i === photos.length;
                    return (
                      <button
                        key={`empty-${i}`}
                        type="button"
                        disabled={!isNextSlot}
                        onClick={() => photoInputRef.current?.click()}
                        className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed transition-colors ${
                          isNextSlot
                            ? "border-grey/40 text-grey hover:border-crimson-red hover:text-crimson-red"
                            : "cursor-default border-light-grey text-light-grey"
                        }`}
                      >
                        <ImagePlus className="size-5" />
                        {isNextSlot && <span className="font-body text-b4-desktop">Add photo</span>}
                      </button>
                    );
                  })}
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={onPendingPhotosPicked}
                />
              </div>

              <div>
                <label className={FORM_LABEL_CLS}>
                  Display date <span className="font-normal text-grey">(optional)</span>
                </label>
                <DisplayDatePicker value={displayDateISO} onChange={setDisplayDateISO} />
              </div>

              <div className="lg:hidden">
                <ReviewPreview
                  tourName={selectedTour?.name}
                  rating={rating}
                  firstName={firstName}
                  location={nationality}
                  title={title}
                  body={body}
                  displayDate={displayDate}
                  photos={previewPhotos}
                />
              </div>
            </div>
          </div>

          <aside className="hidden min-h-0 overflow-y-auto border-l bg-light-grey/40 p-5 lg:block">
            <ReviewPreview
              tourName={selectedTour?.name}
              rating={rating}
              firstName={firstName}
              location={nationality}
              title={title}
              body={body}
              displayDate={displayDate}
              photos={previewPhotos}
            />
          </aside>
        </div>

        <DialogFooter className="border-t bg-white px-6 py-4">
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
            className="rounded-full px-4 py-2 font-body text-b4-desktop font-medium text-midnight hover:bg-light-grey"
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            className="rounded-full bg-crimson-red px-6 py-3 font-body text-b2-desktop font-medium text-white shadow-small transition-all hover:bg-light-red hover:shadow-medium disabled:opacity-50"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditReviewDialog({
  review,
  onOpenChange,
  onSaved,
}: {
  review: ReviewDoc | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [rating, setRating] = useState(5);
  const [categoryRatings, setCategoryRatings] = useState<CategoryRatings>({});
  const [firstName, setFirstName] = useState("");
  const [location, setLocation] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [displayDate, setDisplayDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-seed form fields whenever a new review is opened for editing.
  useEffect(() => {
    if (!review) return;
    setRating(review.rating);
    setCategoryRatings(review.categoryRatings ?? {});
    setFirstName(review.reviewerFirstName);
    setLocation(review.reviewerLocation ?? "");
    setTitle(review.title ?? "");
    setBody(review.bodyMarkdown);
    setDisplayDate(review.displayDate ?? "");
  }, [review]);

  async function submit() {
    if (!review) return;
    if (!firstName.trim()) return toast({ title: "Enter a first name", variant: "destructive" });
    if (body.trim().length < 4) return toast({ title: "Write a review body", variant: "destructive" });

    setSaving(true);
    try {
      await updateReview(
        review.id,
        {
          rating,
          categoryRatings: Object.keys(categoryRatings).length ? categoryRatings : null,
          title: title.trim() || undefined,
          bodyMarkdown: body.trim(),
          reviewerFirstName: firstName.trim(),
          reviewerLastName: review.reviewerLastName,
          reviewerLocation: location.trim() || undefined,
          displayDate: displayDate.trim() || undefined,
        },
        review.tourSlug,
      );
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Failed to save changes", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!review} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit review</DialogTitle>
          <DialogDescription>
            {review?.tourName ? `For ${review.tourName}. ` : ""}
            The tour can&apos;t be changed here — delete and re-add to move a review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Rating</label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRating(n)}>
                  <Star
                    className={`h-6 w-6 ${
                      n <= rating ? "fill-crimson-red text-crimson-red" : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <CategoryStarInputs value={categoryRatings} onChange={setCategoryRatings} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">First name</label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Location</label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="London, United Kingdom"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Headline (optional)</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label className="block text-sm font-medium">Review</label>
              <EmojiPickerButton textareaRef={bodyRef} value={body} onChange={setBody} />
            </div>
            <Textarea
              ref={bodyRef}
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="bg-background"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Display date (optional)</label>
            <DisplayDateSelect value={displayDate} onChange={setDisplayDate} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
