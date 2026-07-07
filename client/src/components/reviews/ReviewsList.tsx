"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, query } from "firebase/firestore";
import ReactMarkdown from "react-markdown";
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
} from "@/services/reviews-service";
import type { ReviewDoc } from "@/types/reviews";
import { isExternalSource } from "@/types/reviews";
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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
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
  Smile, UploadCloud, MapPin,
} from "lucide-react";

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

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Live preview
        </p>
        <p className="text-sm text-muted-foreground">This mirrors the public review card.</p>
      </div>
      <div className="rounded-lg border bg-background p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {firstName.trim() || "Reviewer"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {location.trim() || "Location"}
            </p>
          </div>
          <Stars n={rating} />
        </div>
        {tourName && (
          <p className="mt-3 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs font-medium text-foreground">
            {tourName}
          </p>
        )}
        {title.trim() && <h3 className="mt-3 text-base font-semibold">{title.trim()}</h3>}
        <div className="mt-2 text-sm leading-6 text-muted-foreground">
          <ReactMarkdown
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
              a: ({ children, href }) => (
                <a href={href} className="font-medium text-crimson-red underline">
                  {children}
                </a>
              ),
              ul: ({ children }) => <ul className="mb-2 list-disc pl-5">{children}</ul>,
              ol: ({ children }) => <ol className="mb-2 list-decimal pl-5">{children}</ol>,
            }}
          >
            {reviewBody}
          </ReactMarkdown>
        </div>
        {photos.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {photos.slice(0, 6).map((url) => (
              <img
                key={url}
                src={url}
                alt=""
                className="aspect-square w-full rounded-md object-cover ring-1 ring-border"
              />
            ))}
          </div>
        )}
        <div className="mt-4 border-t pt-3 text-xs text-muted-foreground">
          {displayDate || "Display date hidden"}
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
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [tourSlug, setTourSlug] = useState("");
  const [rating, setRating] = useState(5);
  const [firstName, setFirstName] = useState("");
  const [location, setLocation] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [displayDate, setDisplayDate] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const photosRef = useRef<PendingPhoto[]>([]);
  const selectedTour = tours.find((t) => t.slug === tourSlug);
  const previewPhotos = photos.map((photo) => photo.previewUrl);

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
    setFirstName("");
    setLocation("");
    setTitle("");
    setBody("");
    setDisplayDate("");
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
        title: title.trim() || undefined,
        bodyMarkdown: body.trim(),
        reviewerFirstName: firstName.trim(),
        reviewerLocation: location.trim() || undefined,
        photos: uploadedPhotos,
        displayDate: displayDate.trim() || undefined,
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
      <DialogContent className="grid max-h-[92vh] w-[calc(100vw-2rem)] max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5 pr-12">
          <DialogTitle>Add a review</DialogTitle>
          <DialogDescription>
            Create an admin-authored review. It publishes immediately (unverified).
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-h-0 overflow-y-auto px-6 py-5">
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Tour</label>
                <Select value={tourSlug} onValueChange={setTourSlug}>
                  <SelectTrigger className="bg-background">
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
                <label className="mb-1.5 block text-sm font-medium">Rating</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      className="rounded-md p-0.5 transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                      aria-label={`${n} star rating`}
                    >
                      <Star
                        className={`h-6 w-6 ${
                          n <= rating ? "fill-crimson-red text-crimson-red" : "text-muted-foreground"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">First name</label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="bg-background"
                    placeholder="Jamie"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Location</label>
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="bg-background"
                    placeholder="London, United Kingdom"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Headline</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-background"
                  placeholder="Unforgettable island hopping"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium">Review</label>
                  <EmojiPickerButton textareaRef={bodyRef} value={body} onChange={setBody} />
                </div>
                <Textarea
                  ref={bodyRef}
                  rows={7}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="resize-y bg-background"
                  placeholder="Share the travel moment, guide highlight, or favorite stop..."
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium">Tour pictures</label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => photoInputRef.current?.click()}
                    disabled={photos.length >= 6}
                    className="h-8"
                  >
                    <ImagePlus className="mr-2 h-4 w-4" /> Add photos
                  </Button>
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={onPendingPhotosPicked}
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="flex min-h-24 w-full flex-col items-center justify-center rounded-lg border border-dashed bg-background px-4 py-5 text-center text-sm text-muted-foreground transition hover:border-crimson-red hover:text-foreground"
                >
                  <UploadCloud className="mb-2 h-5 w-5" />
                  Upload review photos, up to 6 images
                </button>
                {photos.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {photos.map((photo) => (
                      <div key={photo.id} className="group relative">
                        <img
                          src={photo.previewUrl}
                          alt=""
                          className="aspect-square w-full rounded-md object-cover ring-1 ring-border"
                        />
                        <button
                          type="button"
                          aria-label="Remove pending photo"
                          onClick={() => removePendingPhoto(photo.id)}
                          className="absolute -right-1.5 -top-1.5 rounded-full bg-background p-1 shadow ring-1 ring-border hover:bg-destructive hover:text-destructive-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium">Display date</label>
                <DisplayDateSelect value={displayDate} onChange={setDisplayDate} />
              </div>

              <div className="lg:hidden">
                <ReviewPreview
                  tourName={selectedTour?.name}
                  rating={rating}
                  firstName={firstName}
                  location={location}
                  title={title}
                  body={body}
                  displayDate={displayDate}
                  photos={previewPhotos}
                />
              </div>
            </div>
          </div>

          <aside className="hidden min-h-0 overflow-y-auto border-l bg-muted/20 p-5 lg:block">
            <ReviewPreview
              tourName={selectedTour?.name}
              rating={rating}
              firstName={firstName}
              location={location}
              title={title}
              body={body}
              displayDate={displayDate}
              photos={previewPhotos}
            />
          </aside>
        </div>

        <DialogFooter className="border-t bg-background px-6 py-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
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
