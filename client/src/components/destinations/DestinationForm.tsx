"use client";

/**
 * DestinationForm — WYSIWYG inline editor that renders the destination page
 * roughly as it appears on www (hero, quick facts, welcome, highlights,
 * community grid, FAQs) with all curated content fields editable in place.
 * Mirrors the ResidentHostForm approach. Hero/region/SEO/publish/linked-tours
 * live in the right-side Settings panel.
 *
 * Sections that are derived live on www (Top Tours, Reviews) and the shared
 * static "Join our community" band are shown as read-only markers here — they
 * are not authored per-destination.
 */

import React, { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Save, ArrowLeft, Plus, X, Settings, Image as ImageIcon, Camera,
  Undo2, Redo2, RotateCcw, ChevronDown, Info, Clock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useUndoRedo } from "@/hooks/use-undo-redo";
import { dateToManilaLocalInput } from "@/lib/manila-time";

import { Destination, DestinationFormData } from "@/types/destinations";
import ImagePickerModal from "@/components/shared/ImagePickerModal";
import DestinationSettingsPanel, { DestinationPickerField } from "./DestinationSettingsPanel";
import ResetChangesModal from "@/components/shared/ResetChangesModal";
import ConfirmLeaveModal from "@/components/shared/ConfirmLeaveModal";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { QuickFactIcon, QUICK_FACT_ICONS } from "./QuickFactIcon";
import { buildDestinationSeo, isAutoSeoTitle, isAutoSeoDescription, pendingSeoPatch } from "./seo-template";
import SeoAutofillModal from "./SeoAutofillModal";
import { getAllTours } from "@/services/tours-service";
import { subscribeToReviews, setReviewStatus } from "@/services/reviews-service";
import type { TourPackage } from "@/types/tours";
import type { ReviewDoc } from "@/types/reviews";
import {
  TopToursPreview,
  DerivedHighlightsPreview,
  ReviewsPreview,
  JoinCommunityPreview,
  deriveHighlights,
} from "./DestinationPreviewSections";

// Icon labels that count as "auto-filled" — safe to replace when the icon
// changes (a label the user typed themselves is left untouched).
const QUICK_FACT_LABELS = new Set(QUICK_FACT_ICONS.map((o) => o.label));

// ─── Helpers ────────────────────────────────────────────────────────────────

const WWW_BASE = "https://www.imheretravels.com";
const resolveImg = (url: string | null | undefined): string => {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${WWW_BASE}${url}`;
  return url;
};

// ─── Schema (zodResolver strips undeclared keys, so list every persisted field) ──

const schema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  region: z.string(),
  status: z.enum(["active", "draft", "archived"]),
  scheduledPublishAt: z.string().nullish(),
  heroImage: z.string(),
  heroImageAlt: z.string(),
  seo: z.object({ title: z.string().optional(), description: z.string().optional() }).optional(),
  description: z.array(z.string()),
  quickFacts: z.array(z.object({ icon: z.string(), label: z.string(), value: z.string() })),
  highlights: z.array(z.object({ image: z.string(), imageAlt: z.string(), title: z.string(), description: z.string() })),
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })),
  community: z.object({
    heading: z.string(),
    images: z.array(z.object({ src: z.string(), alt: z.string(), href: z.string() })),
  }),
  tourSlugs: z.array(z.string()),
  hiddenReviewIds: z.array(z.string()),
});

// ─── Inline editing primitives (local state + debounce, focus-aware sync) ──────

function InlineInput({
  value, onChange, placeholder, className = "",
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current !== document.activeElement) setLocal(value); }, [value]);
  return (
    <input
      ref={ref}
      type="text"
      value={local}
      onChange={(e) => { const v = e.target.value; setLocal(v); clearTimeout(timer.current); timer.current = setTimeout(() => onChange(v), 300); }}
      onBlur={(e) => { clearTimeout(timer.current); onChange(e.target.value); }}
      placeholder={placeholder}
      className={`bg-transparent border-none outline-none w-full px-1 -mx-1 rounded-sm
        hover:ring-2 hover:ring-crimson-red/20 focus:ring-2 focus:ring-crimson-red/40 transition-shadow
        placeholder:text-dark-gray/30 ${className}`}
    />
  );
}

function InlineTextarea({
  value, onChange, placeholder, className = "",
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (ref.current) { ref.current.style.height = "auto"; ref.current.style.height = ref.current.scrollHeight + "px"; } }, [local]);
  useEffect(() => { if (ref.current !== document.activeElement) setLocal(value); }, [value]);
  return (
    <textarea
      ref={ref}
      value={local}
      onChange={(e) => { const v = e.target.value; setLocal(v); clearTimeout(timer.current); timer.current = setTimeout(() => onChange(v), 300); }}
      onBlur={(e) => { clearTimeout(timer.current); onChange(e.target.value); }}
      placeholder={placeholder}
      rows={1}
      className={`bg-transparent border-none outline-none resize-none w-full px-1 -mx-1 rounded-sm
        hover:ring-2 hover:ring-crimson-red/20 focus:ring-2 focus:ring-crimson-red/40 transition-shadow
        placeholder:text-dark-gray/30 ${className}`}
    />
  );
}

function EditZone({ children, label, className = "" }: { children: React.ReactNode; label?: string; className?: string }) {
  return (
    <div className={`relative group/zone ${className}`}>
      {label && (
        <span className="absolute -top-5 left-0 text-[10px] font-body font-bold text-crimson-red uppercase tracking-widest opacity-0 group-hover/zone:opacity-100 transition-opacity pointer-events-none select-none z-10">
          {label}
        </span>
      )}
      <div className="rounded-sm group-hover/zone:ring-2 group-hover/zone:ring-crimson-red/20 transition-shadow">
        {children}
      </div>
    </div>
  );
}

function ImageEditOverlay({ onEdit, onRemove }: { onEdit: () => void; onRemove?: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-all group-hover/img:bg-black/30 group-hover/img:opacity-100">
      <button type="button" onClick={onEdit}
        className="grid size-10 place-items-center rounded-full bg-white text-midnight shadow-small transition-colors hover:text-crimson-red">
        <Camera className="h-5 w-5" />
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove}
          className="grid size-10 place-items-center rounded-full bg-crimson-red text-white shadow-small">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DestinationFormProps {
  onClose: () => void;
  onSubmit: (data: DestinationFormData) => Promise<void | string>;
  destination?: Destination | null;
  isLoading?: boolean;
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function DestinationForm({ onClose, onSubmit, destination, isLoading = false }: DestinationFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);
  const [openIconIdx, setOpenIconIdx] = useState<number | null>(null);
  const [hoverIcon, setHoverIcon] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [seoModalOpen, setSeoModalOpen] = useState(false);
  // The name we've already prompted (or dismissed) the SEO modal for — stops it
  // re-popping until the name actually changes again.
  const promptedNameRef = useRef<string>("");

  const [picker, setPicker] = useState<{
    field: DestinationPickerField | `highlight-${number}` | `community-${number}`;
    initialUrl?: string;
  } | null>(null);

  const form = useForm<any>({
    resolver: zodResolver(schema),
    defaultValues: {
      slug: "", name: "", region: "", status: "draft",
      scheduledPublishAt: "",
      heroImage: "", heroImageAlt: "",
      seo: { title: "", description: "" },
      description: [""],
      quickFacts: [],
      highlights: [],
      faqs: [],
      community: { heading: "With @Imheretravels", images: [] },
      tourSlugs: [],
      hiddenReviewIds: [],
    },
  });

  const w = (n: string) => form.watch(n as any);
  const sv = (n: string, v: any) => form.setValue(n as any, v);
  const gv = (n: string) => form.getValues(n as any);

  const name = w("name") as string;
  const region = w("region") as string;
  const heroImage = w("heroImage") as string;
  const tourSlugs = (w("tourSlugs") as string[]) ?? [];

  // Pending SEO/URL suggestion from the name (drives the Settings-button cue +
  // the "Apply suggested" prompt inside the panel).
  const seoPatch = pendingSeoPatch({
    name: w("name") as string,
    slug: w("slug") as string,
    seo: w("seo") as { title?: string; description?: string } | undefined,
  });
  const hasSeoSuggestion = Object.keys(seoPatch).length > 0;

  // Live data for the read-only section previews (Top Tours / Highlights / Reviews).
  const [allTours, setAllTours] = useState<TourPackage[]>([]);
  const [allReviews, setAllReviews] = useState<ReviewDoc[]>([]);
  useEffect(() => {
    let active = true;
    getAllTours()
      .then((data) => { if (active) setAllTours(data); })
      .catch(() => { if (active) setAllTours([]); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const unsub = subscribeToReviews(setAllReviews, () => setAllReviews([]));
    return unsub;
  }, []);

  const linkedTours = tourSlugs
    .map((slug) => allTours.find((t) => t.slug === slug))
    .filter((t): t is TourPackage => Boolean(t));
  const derivedHighlights = deriveHighlights(linkedTours);

  // ── Reviews: published linked-tour reviews (candidates) + per-destination
  //    local hidden overrides, plus globally-hidden linked-tour reviews for the
  //    "Hidden reviews" modal.
  const hiddenReviewIds = (w("hiddenReviewIds") as string[]) ?? [];
  const linkedReviews = allReviews.filter(
    (r) => r.status === "published" && tourSlugs.includes(r.tourSlug),
  );
  const hiddenTourReviews = allReviews.filter(
    (r) => r.status === "hidden" && tourSlugs.includes(r.tourSlug),
  );

  const addHiddenId = (id: string) => {
    const cur = (gv("hiddenReviewIds") as string[]) ?? [];
    if (!cur.includes(id)) sv("hiddenReviewIds", [...cur, id]);
  };
  const removeHiddenId = (id: string) => {
    sv("hiddenReviewIds", ((gv("hiddenReviewIds") as string[]) ?? []).filter((x) => x !== id));
  };

  // Global status writes to `tourReviews` immediately (a different collection —
  // the destination form save can't carry it). The live review subscription then
  // reflects the change in the preview.
  const hideReviewGlobally = async (id: string, tourSlug: string) => {
    try {
      await setReviewStatus(id, "hidden", tourSlug);
      toast({ title: "Review hidden", description: "This review is now hidden everywhere it appears." });
    } catch {
      toast({ title: "Error", description: "Failed to hide the review.", variant: "destructive" });
    }
  };
  const publishReviewGlobally = async (id: string, tourSlug: string) => {
    try {
      await setReviewStatus(id, "published", tourSlug);
      toast({ title: "Review restored", description: "This review is published again." });
    } catch {
      toast({ title: "Error", description: "Failed to restore the review.", variant: "destructive" });
    }
  };

  const { fields: descFields, append: addDesc, remove: rmDesc } = useFieldArray({ control: form.control, name: "description" as any });
  const { fields: quickFactFields, append: addQuickFact, remove: rmQuickFact } = useFieldArray({ control: form.control, name: "quickFacts" });
  const { fields: highlightFields, append: addHighlight, remove: rmHighlight } = useFieldArray({ control: form.control, name: "highlights" });
  const { fields: faqFields, append: addFaq, remove: rmFaq } = useFieldArray({ control: form.control, name: "faqs" });
  const { fields: communityFields, append: addCommunity, remove: rmCommunity } = useFieldArray({ control: form.control, name: "community.images" });

  // Auto-fill SEO title / description / slug from the name while CREATING.
  // Editing an existing destination never auto-clobbers — the Settings panel
  // offers an explicit "Apply suggested SEO & URL" prompt instead. Manual edits
  // stick: a customized title/description stops re-syncing (auto-markers gone).
  useEffect(() => {
    if (destination) return;
    const n = (name ?? "").trim();
    if (!n) return;
    const sug = buildDestinationSeo(n);
    sv("slug", sug.slug);
    const curTitle = (gv("seo.title") as string) ?? "";
    if (!curTitle.trim() || isAutoSeoTitle(curTitle)) sv("seo.title", sug.title);
    const curDesc = (gv("seo.description") as string) ?? "";
    if (!curDesc.trim() || isAutoSeoDescription(curDesc)) sv("seo.description", sug.description);
  }, [name, destination]);

  // Populate from existing destination
  useEffect(() => {
    if (destination) {
      form.reset({
        slug: destination.slug || "",
        name: destination.name || "",
        region: destination.region || "",
        status: destination.status || "draft",
        scheduledPublishAt: dateToManilaLocalInput((destination as any).scheduledPublishAt),
        heroImage: destination.heroImage ?? "",
        heroImageAlt: destination.heroImageAlt ?? "",
        seo: destination.seo ?? { title: "", description: "" },
        description: destination.description?.length ? destination.description : [""],
        quickFacts: destination.quickFacts ?? [],
        highlights: destination.highlights ?? [],
        faqs: destination.faqs ?? [],
        community: destination.community ?? { heading: "With @Imheretravels", images: [] },
        tourSlugs: destination.tourSlugs ?? [],
        hiddenReviewIds: destination.hiddenReviewIds ?? [],
      });
      // Don't prompt for the name it loaded with — only on a real rename.
      promptedNameRef.current = destination.name || "";
      setEditorKey((k) => k + 1);
    }
  }, [destination, form]);

  // On EDIT: when the name changes, prompt (once, after it settles) to re-sync
  // SEO & URL. Create mode auto-fills live, so no modal there.
  useEffect(() => {
    if (!destination) return;
    const n = (name ?? "").trim();
    if (!n || n === promptedNameRef.current) return;
    const sug = buildDestinationSeo(n);
    const curTitle = (gv("seo.title") as string) ?? "";
    const curDesc = (gv("seo.description") as string) ?? "";
    const curSlug = (gv("slug") as string) ?? "";
    const differs =
      (!!sug.title && sug.title !== curTitle) ||
      (!!sug.slug && sug.slug !== curSlug) ||
      (!!sug.description && sug.description !== curDesc);
    if (!differs) return;
    const t = setTimeout(() => setSeoModalOpen(true), 700);
    return () => clearTimeout(t);
  }, [name, destination]);

  // ── Picker confirm ──────────────────────────────────────────────────────────
  const handlePickerConfirm = (urls: string[]) => {
    if (!picker || !urls[0]) { setPicker(null); return; }
    const { field } = picker;
    if (field === "hero") sv("heroImage", urls[0]);
    else if (field.startsWith("highlight-")) {
      const i = Number(field.replace("highlight-", ""));
      sv(`highlights.${i}.image`, urls[0]);
    } else if (field.startsWith("community-")) {
      const i = Number(field.replace("community-", ""));
      sv(`community.images.${i}.src`, urls[0]);
    }
    setPicker(null);
  };

  // ── Undo / redo / reset history ───────────────────────────────────────────────
  const history = useUndoRedo<any>({
    getSnapshot: () => structuredClone(form.getValues()),
    applySnapshot: (s) => {
      form.reset(structuredClone(s));
      setEditorKey((k) => k + 1);
    },
  });

  const leaveGuard = useUnsavedChangesGuard({ isDirty: history.isDirty, onLeave: onClose });

  useEffect(() => {
    const sub = form.watch(() => history.record());
    return () => sub.unsubscribe();
  }, [form, history.record]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => history.rebase());
    return () => cancelAnimationFrame(raf);
  }, [destination?.id, history.rebase]);

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
    toast({ title: "Changes discarded", description: "The page was reverted to its last saved state." });
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (data: any) => {
    // Always send the scheduled-publish value (empty string clears it server-side).
    const scheduled = (form.getValues("scheduledPublishAt") as string) ?? "";
    data.scheduledPublishAt = scheduled;

    // ── Publish-readiness gate ────────────────────────────────────────────────
    // A destination that is being made Active, or given a schedule that will
    // auto-activate it, must have the content its public page needs. Draft /
    // Archived saves with no schedule are always allowed (work-in-progress).
    const wantsPublish = data.status === "active" || !!scheduled.trim();
    if (wantsPublish) {
      const missing: string[] = [];
      if (!(data.name as string)?.trim()) missing.push("Name");
      if (!(data.slug as string)?.trim()) missing.push("URL slug");
      if (!(data.heroImage as string)?.trim()) missing.push("Hero image");
      if (!(data.region as string)?.trim()) missing.push("Region");
      if (!((data.description as string[]) ?? []).some((p) => p.trim()))
        missing.push("A welcome paragraph");
      if (!((data.tourSlugs as string[]) ?? []).length)
        missing.push("At least one linked tour");

      if (missing.length) {
        toast({
          title: scheduled.trim() ? "Can't schedule publish yet" : "Can't publish yet",
          description: `Fill these in before publishing: ${missing.join(", ")}.`,
          variant: "destructive",
        });
        // Region, hero image and linked tours all live in the Settings panel —
        // open it so the missing fields are reachable.
        setPanelOpen(true);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Drop empty repeated rows so the site renders cleanly.
      const cleaned: DestinationFormData = {
        ...data,
        description: (data.description as string[]).map((p) => p.trim()).filter(Boolean),
        quickFacts: (data.quickFacts as any[]).filter((f) => f.label?.trim() || f.value?.trim()),
        highlights: (data.highlights as any[]).filter((h) => h.title?.trim() || h.image?.trim()),
        faqs: (data.faqs as any[]).filter((f) => f.question?.trim() || f.answer?.trim()),
        community: {
          heading: data.community?.heading || "With @Imheretravels",
          images: (data.community?.images as any[]).filter((img) => img.src?.trim()),
        },
      };
      await onSubmit(cleaned);
      toast({
        title: destination ? "Saved" : "Created",
        description: destination ? "Destination updated successfully." : "New destination created.",
      });
      requestAnimationFrame(() => history.rebase());
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to save destination.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const pickerAspect = picker?.field === "hero" ? 16 / 9 : picker?.field?.startsWith("community-") ? 1 : 4 / 3;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div key={editorKey} className="min-h-screen bg-light-grey">
      {isLoading && (
        <div className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-sm flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-crimson-red border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Toolbar */}
      <div className="sticky top-16 z-30 bg-white border-b border-light-grey shadow-xsmall">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between gap-4">
          <button type="button" onClick={() => leaveGuard.requestNav(onClose)}
            className="flex items-center gap-2 font-body text-sm text-dark-gray hover:text-midnight transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Destinations
          </button>

          <div className="flex items-center gap-3">
            <Select value={w("status")} onValueChange={(v) => sv("status", v)}>
              <SelectTrigger className="h-8 text-xs border-border w-28"><SelectValue /></SelectTrigger>
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
                  <p className="text-xs font-semibold text-midnight">Schedule publish</p>
                  <p className="text-[11px] text-dark-gray leading-snug">
                    The destination automatically switches to{" "}
                    <span className="font-medium">Active</span> at this date &amp; time
                    (<span className="font-medium">Manila / PHT</span>). Leave it as Draft
                    or Archived until then.
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

            {/* Undo / redo / reset */}
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => history.undo()} disabled={!history.canUndo}
                title="Undo (Ctrl+Z)" aria-label="Undo"
                className="flex items-center justify-center h-9 w-9 rounded-full border border-border text-midnight hover:bg-light-grey disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <Undo2 className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => history.redo()} disabled={!history.canRedo}
                title="Redo (Ctrl+Shift+Z)" aria-label="Redo"
                className="flex items-center justify-center h-9 w-9 rounded-full border border-border text-midnight hover:bg-light-grey disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <Redo2 className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setResetOpen(true)} disabled={!history.canUndo && !history.canRedo}
                title="Discard all changes" aria-label="Discard all changes"
                className="flex items-center justify-center h-9 w-9 rounded-full border border-border text-midnight hover:bg-light-grey hover:text-crimson-red disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>

            <button type="button" onClick={() => setPanelOpen((p) => !p)}
              className={`relative flex items-center gap-1.5 h-9 px-4 rounded-full border font-body text-sm transition-colors ${panelOpen ? "border-crimson-red bg-crimson-red/5 text-crimson-red" : "border-border text-midnight hover:bg-light-grey"}`}>
              <Settings className="h-4 w-4" />
              Settings
              {hasSeoSuggestion && !panelOpen && (
                <span
                  className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-crimson-red ring-2 ring-white"
                  title="Suggested SEO & URL available"
                />
              )}
            </button>

            <Button type="button" disabled={isSubmitting}
              onClick={form.handleSubmit(handleSubmit, (errs) => {
                console.error("Form validation errors:", errs);
                toast({ title: "Validation error", description: "Check required fields (name, slug) and try again.", variant: "destructive" });
              })}
              className="h-9 bg-crimson-red hover:bg-light-red text-white rounded-full px-5 font-body font-bold text-sm shadow-small">
              <Save className="h-4 w-4 mr-1.5" />
              {isSubmitting ? "Saving…" : destination ? "Save Changes" : "Create Destination"}
            </Button>
          </div>
        </div>
      </div>

      {/* Preview-approximation notice */}
      <div className="border-b border-royal-purple/10 bg-royal-purple/5">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-2.5 flex items-start gap-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-royal-purple" />
          <p className="font-body text-xs text-dark-gray">
            <span className="font-semibold text-midnight">Preview approximation.</span>{" "}
            The sections below are a lighter in-CMS rendering to help you edit content — they
            won&apos;t match the live website pixel-for-pixel (fonts, spacing, and some interactive
            elements differ). Use <span className="font-semibold">View on site</span> to see the real page.
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit, (errs) => console.error("Form validation errors:", errs))}>

          {/* ── HERO ─────────────────────────────────────────────────────── */}
          <section className="group/img relative h-[260px] w-full overflow-hidden md:h-[360px]">
            {heroImage ? (
              <img src={resolveImg(heroImage)} alt={w("heroImageAlt") ?? ""} className="absolute inset-0 h-full w-full object-cover object-center" />
            ) : (
              <div className="absolute inset-0 bg-crimson-red" />
            )}
            <div className="absolute inset-0 bg-black/20" />

            <div className="absolute right-4 top-4 z-10 flex gap-2 opacity-0 transition-opacity group-hover/img:opacity-100">
              <button type="button" onClick={() => setPicker({ field: "hero", initialUrl: resolveImg(heroImage) || undefined })}
                className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-midnight shadow-small hover:text-crimson-red">
                <Camera className="h-3.5 w-3.5" /> {heroImage ? "Change hero" : "Add hero"}
              </button>
            </div>

            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <span className="inline-block rounded-full bg-crimson-red px-4 py-1 font-body text-b4-desktop text-white">
                {region || "Region"}
              </span>
              <InlineInput
                value={name ?? ""}
                onChange={(v) => sv("name", v)}
                placeholder="Destination name"
                className="font-display text-h1-mobile md:text-h1-desktop text-white text-center placeholder:text-white/40"
              />
              <p className="font-body text-b2-mobile text-white/80 md:text-b2-desktop">
                {tourSlugs.length} {tourSlugs.length === 1 ? "tour" : "tours"} available
              </p>
              <span className="mt-2 inline-flex items-center justify-center rounded-full bg-white px-6 py-3 font-body font-medium text-midnight select-none">
                View All Tours
              </span>
            </div>
          </section>

          {/* ── QUICK FACTS ──────────────────────────────────────────────── */}
          <section className="border-b border-light-grey bg-white">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">
              <EditZone label="Quick facts">
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {quickFactFields.map((field, i) => (
                    <div key={field.id} className="group/fact relative flex items-center gap-2 rounded-full border border-light-grey px-4 py-2.5">
                      {/* Icon picker */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenIconIdx(openIconIdx === i ? null : i)}
                          title="Choose icon"
                          className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-midnight transition-colors hover:border-crimson-red hover:text-crimson-red"
                        >
                          <QuickFactIcon icon={w(`quickFacts.${i}.icon`) ?? "currency"} className="size-5" />
                        </button>
                        {openIconIdx === i && (
                          <>
                            <div className="fixed inset-0 z-20" onClick={() => { setOpenIconIdx(null); setHoverIcon(null); }} aria-hidden />
                            <div className="absolute left-0 top-full z-30 mt-1 w-60 rounded-xl border border-light-grey bg-white p-2 shadow-medium">
                              <div className="grid grid-cols-5 gap-1">
                                {QUICK_FACT_ICONS.map((opt) => {
                                  const selected = (w(`quickFacts.${i}.icon`) ?? "currency") === opt.id;
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onMouseEnter={() => setHoverIcon(opt.id)}
                                      onMouseLeave={() => setHoverIcon(null)}
                                      onClick={() => {
                                        sv(`quickFacts.${i}.icon`, opt.id);
                                        // Auto-fill the label unless the user typed a custom one.
                                        const currentLabel = ((gv(`quickFacts.${i}.label`) as string) ?? "").trim();
                                        if (!currentLabel || QUICK_FACT_LABELS.has(currentLabel)) {
                                          sv(`quickFacts.${i}.label`, opt.label);
                                        }
                                        setOpenIconIdx(null);
                                        setHoverIcon(null);
                                      }}
                                      className={`grid size-9 place-items-center rounded-lg border transition-colors ${selected ? "border-crimson-red bg-crimson-red/5 text-crimson-red" : "border-transparent text-dark-gray hover:bg-light-grey"}`}
                                    >
                                      <QuickFactIcon icon={opt.id} className="size-5" />
                                    </button>
                                  );
                                })}
                              </div>
                              {/* Hover label (falls back to the selected icon's label) */}
                              <div className="mt-1.5 border-t border-light-grey pt-1.5 text-center text-[11px] font-medium text-dark-gray">
                                {QUICK_FACT_ICONS.find(
                                  (o) => o.id === (hoverIcon ?? (w(`quickFacts.${i}.icon`) ?? "currency")),
                                )?.label ?? ""}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="text-left">
                        <InlineInput value={w(`quickFacts.${i}.label`) ?? ""} onChange={(v) => sv(`quickFacts.${i}.label`, v)} placeholder="Label"
                          className="font-body text-[10px] uppercase tracking-widest text-grey" />
                        <InlineInput value={w(`quickFacts.${i}.value`) ?? ""} onChange={(v) => sv(`quickFacts.${i}.value`, v)} placeholder="Value"
                          className="font-sans text-b4-desktop font-bold text-midnight" />
                      </div>
                      <button type="button" onClick={() => rmQuickFact(i)}
                        className="opacity-0 group-hover/fact:opacity-100 transition-opacity text-crimson-red">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => (addQuickFact as any)({ icon: "currency", label: "", value: "" })}
                    className="flex items-center gap-1 rounded-full border-2 border-dashed border-crimson-red/40 px-4 py-2.5 font-body text-b4-desktop text-crimson-red hover:border-crimson-red hover:bg-crimson-red/5">
                    <Plus className="h-4 w-4" /> Add fact
                  </button>
                </div>
              </EditZone>
            </div>
          </section>

          {/* ── WELCOME ──────────────────────────────────────────────────── */}
          <section className="mx-auto w-full max-w-4xl px-4 py-12 text-center md:px-8 md:py-16">
            <h2 className="font-sans text-h3-mobile md:text-h3-desktop text-midnight">
              Welcome to {name || "…"}
            </h2>
            <div className="mt-6 flex flex-col gap-4">
              {descFields.map((field, i) => (
                <div key={field.id} className="group/para flex items-start gap-2">
                  <InlineTextarea value={w(`description.${i}`) ?? ""} onChange={(v) => sv(`description.${i}`, v)} placeholder="Welcome paragraph…"
                    className="font-body text-b2-mobile md:text-b2-desktop text-dark-gray text-center" />
                  <button type="button" onClick={() => rmDesc(i)}
                    className="mt-1 opacity-0 group-hover/para:opacity-100 transition-opacity text-crimson-red shrink-0">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => (addDesc as any)("")}
                className="mx-auto flex items-center gap-1 font-body text-b4-desktop text-crimson-red hover:text-light-red">
                <Plus className="h-4 w-4" /> Add paragraph
              </button>
            </div>
          </section>

          {/* ── TOP TOURS (live) ─────────────────────────────────────────── */}
          <section className="bg-light-grey">
            <TopToursPreview name={name} linkedTours={linkedTours} />
          </section>

          {/* ── HIGHLIGHTS ───────────────────────────────────────────────── */}
          <section className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8 md:py-16">
            <div className="mb-8 flex items-center justify-between gap-4">
              <h2 className="font-sans text-h3-mobile md:text-h3-desktop text-midnight">
                {name || "Destination"} Highlights
              </h2>
            </div>
            <p className="mb-6 font-body text-b4-desktop text-dark-gray">
              Leave empty to auto-generate highlights from the linked tours&apos; trip highlights. Add cards below to override with a custom set.
            </p>

            {/* Auto-generated preview (shown only while there's no manual override) */}
            {highlightFields.length === 0 && derivedHighlights.length > 0 && (
              <div className="mb-6">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-dark-gray/50">
                  Auto-generated from linked tours · read-only
                </p>
                <DerivedHighlightsPreview highlights={derivedHighlights} />
              </div>
            )}

            <div className="flex gap-5 overflow-x-auto pb-2 scrollbar-hide">
              {highlightFields.map((field, i) => (
                <div key={field.id} className="group/hl relative w-72 shrink-0 overflow-hidden rounded-lg bg-white shadow-small">
                  <button type="button" onClick={() => rmHighlight(i)}
                    className="absolute right-2 top-2 z-20 grid size-7 place-items-center rounded-full bg-white/90 text-crimson-red opacity-0 shadow-small transition-opacity group-hover/hl:opacity-100">
                    <X className="h-4 w-4" />
                  </button>
                  <div className="group/img relative aspect-[4/3] w-full overflow-hidden bg-light-grey">
                    {w(`highlights.${i}.image`) ? (
                      <>
                        <img src={resolveImg(w(`highlights.${i}.image`))} alt={w(`highlights.${i}.imageAlt`) ?? ""} className="h-full w-full object-cover" />
                        <ImageEditOverlay
                          onEdit={() => setPicker({ field: `highlight-${i}`, initialUrl: resolveImg(w(`highlights.${i}.image`)) || undefined })}
                          onRemove={() => sv(`highlights.${i}.image`, "")}
                        />
                      </>
                    ) : (
                      <button type="button" onClick={() => setPicker({ field: `highlight-${i}` })}
                        className="flex h-full w-full flex-col items-center justify-center gap-1 text-dark-gray/40 hover:bg-light-grey/70">
                        <ImageIcon className="h-7 w-7" />
                        <span className="text-xs">Add image</span>
                      </button>
                    )}
                  </div>
                  <div className="p-4">
                    <InlineInput value={w(`highlights.${i}.title`) ?? ""} onChange={(v) => sv(`highlights.${i}.title`, v)} placeholder="Highlight title"
                      className="font-sans text-h6-mobile md:text-h6-desktop text-midnight" />
                    <InlineTextarea value={w(`highlights.${i}.description`) ?? ""} onChange={(v) => sv(`highlights.${i}.description`, v)} placeholder="Short description…"
                      className="mt-1 font-body text-b4-mobile md:text-b4-desktop text-dark-gray" />
                    <InlineInput value={w(`highlights.${i}.imageAlt`) ?? ""} onChange={(v) => sv(`highlights.${i}.imageAlt`, v)} placeholder="Image alt text"
                      className="mt-2 font-body text-[10px] text-grey" />
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => (addHighlight as any)({ image: "", imageAlt: "", title: "", description: "" })}
                className="flex w-72 shrink-0 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-crimson-red/40 p-5 text-crimson-red transition-colors hover:border-crimson-red hover:bg-crimson-red/5">
                <Plus className="h-6 w-6" />
                <span className="font-body text-sm font-semibold">Add Highlight</span>
              </button>
            </div>
          </section>

          {/* ── REVIEWS (live) ───────────────────────────────────────────── */}
          <section className="bg-light-grey">
            <ReviewsPreview
              name={name}
              linkedReviews={linkedReviews}
              hiddenTourReviews={hiddenTourReviews}
              hiddenIds={hiddenReviewIds}
              manageReviewsHref="/reviews"
              onHideDestination={(id) => addHiddenId(id)}
              onHideTour={(id, tourSlug) => hideReviewGlobally(id, tourSlug)}
              onHideBoth={(id, tourSlug) => { addHiddenId(id); hideReviewGlobally(id, tourSlug); }}
              onUnhide={(id, tourSlug, wasGlobal) => {
                if (wasGlobal) publishReviewGlobally(id, tourSlug);
                removeHiddenId(id);
              }}
            />
          </section>

          {/* ── COMMUNITY GRID ───────────────────────────────────────────── */}
          <section className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8 md:py-16">
            <div className="mb-8 text-center">
              <EditZone label="Community heading">
                <InlineInput value={w("community.heading") ?? ""} onChange={(v) => sv("community.heading", v)} placeholder="With @Imheretravels"
                  className="font-sans text-h3-mobile md:text-h3-desktop text-midnight text-center" />
              </EditZone>
              <p className="mt-2 font-body text-b4-desktop text-dark-gray">
                Add Instagram photos below. Leave empty to hide this section on the site.
              </p>
            </div>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {communityFields.map((field, i) => (
                <li key={field.id} className="group/img relative aspect-square overflow-hidden rounded-md bg-light-grey">
                  {w(`community.images.${i}.src`) ? (
                    <>
                      <img src={resolveImg(w(`community.images.${i}.src`))} alt={w(`community.images.${i}.alt`) ?? ""} className="h-full w-full object-cover" />
                      <ImageEditOverlay
                        onEdit={() => setPicker({ field: `community-${i}`, initialUrl: resolveImg(w(`community.images.${i}.src`)) || undefined })}
                        onRemove={() => rmCommunity(i)}
                      />
                    </>
                  ) : (
                    <button type="button" onClick={() => setPicker({ field: `community-${i}` })}
                      className="flex h-full w-full flex-col items-center justify-center gap-1 text-dark-gray/40 hover:bg-light-grey/70">
                      <ImageIcon className="h-6 w-6" />
                      <span className="text-[10px]">Add photo</span>
                    </button>
                  )}
                </li>
              ))}
              <li>
                <button type="button" onClick={() => (addCommunity as any)({ src: "", alt: "", href: "https://www.instagram.com/imheretravels" })}
                  className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-crimson-red/40 text-crimson-red transition-colors hover:border-crimson-red hover:bg-crimson-red/5">
                  <Plus className="h-5 w-5" />
                  <span className="text-[10px] font-semibold">Add</span>
                </button>
              </li>
            </ul>
          </section>

          {/* ── FAQs (website accordion look, inline-editable) ───────────── */}
          <section className="bg-light-grey">
            <div className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8 md:py-16">
              <h2 className="mb-10 text-center font-sans text-h3-mobile md:text-h3-desktop text-midnight">
                {name || "Destination"} FAQs
              </h2>
              <div className="mx-auto rounded-lg bg-white p-6 shadow-small md:p-10" style={{ width: "1200px", maxWidth: "100%" }}>
                {faqFields.length === 0 && (
                  <p className="py-2 text-center font-body text-b4-desktop text-dark-gray/60">
                    No FAQs yet. Add one below.
                  </p>
                )}
                {faqFields.map((field, i) => {
                  const open = openFaq === i;
                  return (
                    <div key={field.id}>
                      <div className="py-2">
                        <div className="group/faq flex items-start justify-between gap-4 py-3">
                          <InlineTextarea
                            value={w(`faqs.${i}.question`) ?? ""}
                            onChange={(v) => sv(`faqs.${i}.question`, v)}
                            placeholder="Question"
                            className="flex-1 font-sans text-h6-mobile md:text-h6-desktop text-midnight"
                          />
                          <div className="flex shrink-0 items-center gap-1 pt-1">
                            <button type="button" onClick={() => rmFaq(i)} title="Remove FAQ"
                              className="opacity-0 group-hover/faq:opacity-100 transition-opacity text-crimson-red">
                              <X className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => setOpenFaq(open ? null : i)} title={open ? "Collapse" : "Expand"}
                              className="grid size-6 place-items-center text-midnight">
                              <ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} />
                            </button>
                          </div>
                        </div>
                        {open && (
                          <InlineTextarea
                            value={w(`faqs.${i}.answer`) ?? ""}
                            onChange={(v) => sv(`faqs.${i}.answer`, v)}
                            placeholder="Answer"
                            className="pt-2 pb-4 font-body text-b2-mobile md:text-b2-desktop text-midnight"
                          />
                        )}
                      </div>
                      {i < faqFields.length - 1 && <div className="h-px w-full bg-[#d7d6db]" />}
                    </div>
                  );
                })}
                <button type="button" onClick={() => { (addFaq as any)({ question: "", answer: "" }); setOpenFaq(faqFields.length); }}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-crimson-red/40 p-3 text-crimson-red transition-colors hover:border-crimson-red hover:bg-crimson-red/5">
                  <Plus className="h-5 w-5" />
                  <span className="font-body text-sm font-semibold">Add FAQ</span>
                </button>
              </div>
              <div className="mt-6 text-center">
                <span className="font-body text-b4-desktop text-crimson-red underline-offset-2">
                  View all FAQs →
                </span>
              </div>
            </div>
          </section>

          {/* ── JOIN OUR COMMUNITY (static) ──────────────────────────────── */}
          <JoinCommunityPreview />
        </form>

        <DestinationSettingsPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          form={form}
          destination={destination ?? null}
          onPickImage={(field, initialUrl) => setPicker({ field, initialUrl })}
        />
      </Form>

      {/* Image picker */}
      {picker && (
        <ImagePickerModal
          open
          onClose={() => setPicker(null)}
          onConfirm={handlePickerConfirm}
          storageFolder={w("slug") ? `images/destinations/${w("slug")}` : "images/destinations"}
          aspectRatio={pickerAspect}
          initialImageUrl={picker.initialUrl}
          title={
            picker.field === "hero" ? "Select Hero Image"
            : picker.field.startsWith("highlight-") ? "Select Highlight Image"
            : "Select Community Photo"
          }
        />
      )}

      {/* Reset confirmation */}
      <ResetChangesModal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={handleResetConfirm}
      />

      {/* Leave-with-unsaved-changes confirmation */}
      <ConfirmLeaveModal
        open={leaveGuard.isPending}
        onClose={leaveGuard.cancel}
        onConfirm={leaveGuard.confirm}
      />

      {/* Rename → offer to re-sync SEO & URL */}
      <SeoAutofillModal
        open={seoModalOpen}
        name={name}
        current={{
          title: (w("seo.title") as string) || "",
          description: (w("seo.description") as string) || "",
          slug: (w("slug") as string) || "",
        }}
        suggestion={buildDestinationSeo(name)}
        isAutoTitle={isAutoSeoTitle((w("seo.title") as string) || "")}
        isAutoDescription={isAutoSeoDescription((w("seo.description") as string) || "")}
        onApply={(patch) => {
          if (patch.title !== undefined) sv("seo.title", patch.title);
          if (patch.description !== undefined) sv("seo.description", patch.description);
          if (patch.slug !== undefined) sv("slug", patch.slug);
          promptedNameRef.current = (name ?? "").trim();
          setSeoModalOpen(false);
        }}
        onClose={() => {
          promptedNameRef.current = (name ?? "").trim();
          setSeoModalOpen(false);
        }}
      />
    </div>
  );
}
