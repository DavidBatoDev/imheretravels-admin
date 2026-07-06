"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { uploadFile, STORAGE_BUCKET } from "@/utils/file-upload";
import {
  subscribeToReviews,
  setReviewStatus,
  deleteReview,
  updateReviewPhotos,
  createAdminReview,
} from "@/services/reviews-service";
import type { ReviewDoc } from "@/types/reviews";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
  BadgeCheck, Loader2,
} from "lucide-react";

const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

type TourOption = { id: string; slug: string; name: string };

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

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  published: "default",
  hidden: "secondary",
  pending: "outline",
};

export default function ReviewsList() {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<ReviewDoc[]>([]);
  const [tours, setTours] = useState<TourOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tourFilter, setTourFilter] = useState("all");

  const [toDelete, setToDelete] = useState<ReviewDoc | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
      if (tourFilter !== "all" && r.tourSlug !== tourFilter) return false;
      if (!term) return true;
      return (
        r.reviewerFirstName.toLowerCase().includes(term) ||
        r.bodyMarkdown.toLowerCase().includes(term) ||
        (r.tourName || "").toLowerCase().includes(term)
      );
    });
  }, [reviews, search, statusFilter, tourFilter]);

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
      for (const file of files) {
        const res = await uploadFile(file, {
          bucket: STORAGE_BUCKET,
          folder: `review-photos/${target.tourId || "admin"}`,
          maxSize: 8 * 1024 * 1024,
          allowedTypes: ALLOWED,
          generateUniqueName: true,
        });
        if (res.success && res.data) urls.push(res.data.publicUrl);
      }
      const next = [...(target.photos ?? []), ...urls];
      await updateReviewPhotos(target.id, next, target.tourSlug);
      toast({ title: `Added ${urls.length} photo${urls.length === 1 ? "" : "s"}` });
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
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search quote, name, or tour…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tourFilter} onValueChange={setTourFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Tour" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tours</SelectItem>
              {tourNames.map((t) => (
                <SelectItem key={t.slug} value={t.slug}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add review
        </Button>
      </div>

      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>{counts.total} total</span>
        <span>{counts.published} published</span>
        <span>{counts.hidden} hidden</span>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[280px]">Review</TableHead>
                  <TableHead>Reviewer</TableHead>
                  <TableHead>Tour</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No reviews found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={r.id} className={r.status === "hidden" ? "opacity-60" : ""}>
                      <TableCell className="align-top">
                        {r.title && <p className="font-semibold">{r.title}</p>}
                        <p className="line-clamp-3 max-w-md whitespace-pre-wrap text-sm text-muted-foreground">
                          {r.bodyMarkdown}
                        </p>
                        {r.photos && r.photos.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {r.photos.map((url) => (
                              <span key={url} className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url}
                                  alt=""
                                  className="h-10 w-10 rounded object-cover"
                                />
                                <button
                                  type="button"
                                  aria-label="Remove photo"
                                  onClick={() => removePhoto(r, url)}
                                  disabled={busyId === r.id}
                                  className="absolute -right-1 -top-1 rounded-full bg-background p-0.5 shadow"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex items-center gap-1 font-medium">
                          {r.reviewerFirstName}
                          {r.verified && (
                            <BadgeCheck className="h-3.5 w-3.5 text-green-600" aria-label="Verified" />
                          )}
                        </div>
                        {r.reviewerLocation && (
                          <p className="text-xs text-muted-foreground">{r.reviewerLocation}</p>
                        )}
                        <p className="text-xs capitalize text-muted-foreground">{r.source}</p>
                      </TableCell>
                      <TableCell className="align-top text-sm">{r.tourName}</TableCell>
                      <TableCell className="align-top">
                        <Stars n={r.rating} />
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={STATUS_VARIANT[r.status] ?? "outline"} className="capitalize">
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top text-sm text-muted-foreground">
                        {r.displayDate ||
                          (r.createdAt
                            ? new Date(r.createdAt).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "—")}
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={busyId === r.id}>
                              {busyId === r.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
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
  const [tourSlug, setTourSlug] = useState("");
  const [rating, setRating] = useState(5);
  const [firstName, setFirstName] = useState("");
  const [location, setLocation] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [displayDate, setDisplayDate] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setTourSlug("");
    setRating(5);
    setFirstName("");
    setLocation("");
    setTitle("");
    setBody("");
    setDisplayDate("");
  }

  async function submit() {
    const tour = tours.find((t) => t.slug === tourSlug);
    if (!tour) return toast({ title: "Choose a tour", variant: "destructive" });
    if (!firstName.trim()) return toast({ title: "Enter a first name", variant: "destructive" });
    if (body.trim().length < 4) return toast({ title: "Write a review body", variant: "destructive" });

    setSaving(true);
    try {
      await createAdminReview({
        tourId: tour.id,
        tourSlug: tour.slug,
        tourName: tour.name,
        rating,
        title: title.trim() || undefined,
        bodyMarkdown: body.trim(),
        reviewerFirstName: firstName.trim(),
        reviewerLocation: location.trim() || undefined,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a review</DialogTitle>
          <DialogDescription>
            Create an admin-authored review. It publishes immediately (unverified).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Tour</label>
            <Select value={tourSlug} onValueChange={setTourSlug}>
              <SelectTrigger>
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
            <label className="mb-1 block text-sm font-medium">Review (markdown supported)</label>
            <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Display date (optional)</label>
            <Input
              value={displayDate}
              onChange={(e) => setDisplayDate(e.target.value)}
              placeholder="May 2023"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
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
