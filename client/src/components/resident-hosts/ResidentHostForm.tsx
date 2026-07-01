"use client";

/**
 * ResidentHostForm — WYSIWYG inline editor that renders the resident-host page
 * exactly as it appears on www (hero, intro, upcoming trips, why-travel,
 * gallery, how-it-works) with all content fields editable in place. Mirrors the
 * TourForm approach. Hero/profile/SEO/publish/attached-tours live in the
 * right-side Settings panel; the masonry gallery is edited via a modal.
 */

import React, { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Save, ArrowLeft, Plus, X, Settings, Image as ImageIcon, Camera, Pencil,
  Link2, Calendar, ArrowRight, Undo2, Redo2, RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Form } from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUndoRedo } from "@/hooks/use-undo-redo";
import { generateSlug } from "@/utils";

import { ResidentHost, ResidentHostFormData, GalleryMediaItem } from "@/types/resident-hosts";
import type { TourPackage } from "@/types/tours";
import { getAllTours } from "@/services/tours-service";
import ImagePickerModal from "@/components/shared/ImagePickerModal";
import ResidentHostSettingsPanel, { HostPickerField } from "./ResidentHostSettingsPanel";
import GallerySlidesEditor from "./GallerySlidesEditor";
import ResetChangesModal from "@/components/shared/ResetChangesModal";
import ConfirmLeaveModal from "@/components/shared/ConfirmLeaveModal";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

// ─── Helpers ────────────────────────────────────────────────────────────────

const WWW_BASE = "https://www.imheretravels.com";
const resolveImg = (url: string | null | undefined): string => {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("http")) return url;
  if (url.startsWith("/")) return `${WWW_BASE}${url}`;
  return url;
};

// ─── Schema (zodResolver strips undeclared keys, so list every persisted field) ──

const tripSchema = z.object({
  name: z.string(),
  dates: z.string(),
  tourId: z.string().optional(),
  tourSlug: z.string().optional(),
  image: z.string().optional(),
  imageAlt: z.string().optional(),
  duration: z.string().optional(),
  description: z.string().optional(),
  price: z.string().optional(),
  priceNote: z.string().optional(),
  comingSoon: z.boolean().optional(),
});

const galleryItemSchema = z.object({
  seq: z.number(),
  type: z.enum(["photo", "video", "placeholder"]),
  size: z.enum(["tall", "short"]),
  src: z.string().optional(),
  alt: z.string().optional(),
  objectPosition: z.string().optional(),
});

const schema = z.object({
  slug: z.string().min(1),
  displayName: z.string().min(1),
  pageTitle: z.string().min(1),
  status: z.enum(["active", "draft", "archived"]),
  comingSoon: z.boolean().default(false),
  instagram: z.string().optional().or(z.literal("")),
  heroImage: z.string().nullable().optional(),
  heroImageAlt: z.string(),
  heroImages: z.array(z.string()).optional(),
  profileImage: z.string().optional().or(z.literal("")),
  seo: z.object({ title: z.string().optional(), description: z.string().optional() }).optional(),
  intro: z.array(z.string()),
  upcomingTrips: z.array(tripSchema),
  whyTravel: z.array(z.string()),
  whyTravelNotes: z.array(z.string()).optional(),
  howItWorks: z.array(z.string()),
  gallerySlides: z.array(z.array(z.array(galleryItemSchema))).optional(),
  galleryImages: z.array(z.object({ src: z.string(), alt: z.string() })).optional(),
  attachedTourIds: z.array(z.string()),
});

// ─── Inline editing primitives (local state + debounce, focus-aware sync) ──────

function AutoSizeInput({
  value, onChange, placeholder, className = "",
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current !== document.activeElement) setLocal(value); }, [value]);
  return (
    <span className="relative inline-flex min-w-[2ch]">
      <span className={`invisible whitespace-pre pointer-events-none select-none px-1 ${className}`} aria-hidden>
        {local || placeholder || " "}
      </span>
      <input
        ref={ref}
        type="text"
        value={local}
        onChange={(e) => { const v = e.target.value; setLocal(v); clearTimeout(timer.current); timer.current = setTimeout(() => onChange(v), 300); }}
        onBlur={(e) => { clearTimeout(timer.current); onChange(e.target.value); }}
        placeholder={placeholder}
        className={`absolute inset-0 w-full bg-transparent border-none outline-none px-1 rounded-sm
          hover:ring-2 hover:ring-crimson-red/20 focus:ring-2 focus:ring-crimson-red/40 transition-shadow
          placeholder:text-dark-gray/30 ${className}`}
      />
    </span>
  );
}

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

/** Round image-edit button used over hero/profile/trip images on hover. */
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

interface ResidentHostFormProps {
  onClose: () => void;
  onSubmit: (data: ResidentHostFormData) => Promise<void | string>;
  host?: ResidentHost | null;
  isLoading?: boolean;
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function ResidentHostForm({ onClose, onSubmit, host, isLoading = false }: ResidentHostFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [galleryModalOpen, setGalleryModalOpen] = useState(false);
  const [gallerySlideIdx, setGallerySlideIdx] = useState(0);
  const [editorKey, setEditorKey] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);

  const [picker, setPicker] = useState<{ field: HostPickerField | `trip-${number}`; initialUrl?: string } | null>(null);

  // Tours available to link to upcoming-trip cards (picker stores the tour ID).
  const [tours, setTours] = useState<TourPackage[]>([]);
  useEffect(() => {
    let active = true;
    getAllTours()
      .then((data) => { if (active) setTours(data); })
      .catch(() => { if (active) setTours([]); });
    return () => { active = false; };
  }, []);

  const form = useForm<any>({
    resolver: zodResolver(schema),
    defaultValues: {
      slug: "", displayName: "", pageTitle: "", status: "draft", comingSoon: false,
      instagram: "", heroImage: null, heroImageAlt: "", heroImages: [], profileImage: "",
      seo: { title: "", description: "" },
      intro: [""], upcomingTrips: [], whyTravel: [], whyTravelNotes: [], howItWorks: [
        "Choose your host & trip",
        "Secure your spot with a deposit",
        "Pay in installments up to 4 times",
        "Travel and meet your community",
      ],
      gallerySlides: [], galleryImages: [], attachedTourIds: [],
    },
  });

  const w = (n: string) => form.watch(n as any);
  const sv = (n: string, v: any) => form.setValue(n as any, v);
  const gv = (n: string) => form.getValues(n as any);

  const displayName = w("displayName") as string;
  const pageTitle = w("pageTitle") as string;
  const heroImage = w("heroImage") as string | null;
  const heroImages = (w("heroImages") as string[] | undefined) ?? [];
  const triPanel = heroImages.filter(Boolean).length === 3;
  const profileImage = w("profileImage") as string;
  const instagram = w("instagram") as string;
  const intro = (w("intro") as string[]) ?? [];
  const trips = (w("upcomingTrips") as any[]) ?? [];
  const whyTravel = (w("whyTravel") as string[]) ?? [];
  const howItWorks = (w("howItWorks") as string[]) ?? [];
  const gallerySlides = (w("gallerySlides") as GalleryMediaItem[][][]) ?? [];

  const { fields: introFields, append: addIntro, remove: rmIntro } = useFieldArray({ control: form.control, name: "intro" as any });
  const { fields: tripFields, append: addTrip, remove: rmTrip } = useFieldArray({ control: form.control, name: "upcomingTrips" });
  const { fields: whyFields, append: addWhyField, remove: rmWhyField } = useFieldArray({ control: form.control, name: "whyTravel" as any });
  const { fields: howFields, append: addHow, remove: rmHow } = useFieldArray({ control: form.control, name: "howItWorks" as any });

  const addWhy = () => {
    (addWhyField as any)("");
    sv("whyTravelNotes", [...((gv("whyTravelNotes") as string[]) ?? []), ""]);
  };
  const rmWhy = (i: number) => {
    rmWhyField(i);
    const notes = [...((gv("whyTravelNotes") as string[]) ?? [])];
    notes.splice(i, 1);
    sv("whyTravelNotes", notes);
  };

  // Auto-slug while creating
  useEffect(() => { if (displayName && !host) sv("slug", generateSlug(displayName)); }, [displayName, host]);

  // Populate from existing host
  useEffect(() => {
    if (host) {
      form.reset({
        slug: host.slug || "",
        displayName: host.displayName || "",
        pageTitle: host.pageTitle || "",
        status: host.status || "draft",
        comingSoon: host.comingSoon ?? false,
        instagram: host.instagram ?? "",
        heroImage: host.heroImage ?? null,
        heroImageAlt: host.heroImageAlt ?? "",
        heroImages: host.heroImages ?? [],
        profileImage: host.profileImage ?? "",
        seo: host.seo ?? { title: "", description: "" },
        intro: host.intro?.length ? host.intro : [""],
        upcomingTrips: host.upcomingTrips ?? [],
        whyTravel: host.whyTravel ?? [],
        whyTravelNotes: host.whyTravelNotes ?? [],
        howItWorks: host.howItWorks?.length ? host.howItWorks : [""],
        gallerySlides: host.gallerySlides ?? [],
        galleryImages: host.galleryImages ?? [],
        attachedTourIds: host.attachedTourIds ?? [],
      });
      setEditorKey((k) => k + 1);
    }
  }, [host, form]);

  // ── Picker confirm ──────────────────────────────────────────────────────────
  const handlePickerConfirm = (urls: string[]) => {
    if (!picker || !urls[0]) { setPicker(null); return; }
    const { field } = picker;
    if (field === "hero") sv("heroImage", urls[0]);
    else if (field === "profile") sv("profileImage", urls[0]);
    else if (field.startsWith("heroPanel-")) {
      const i = Number(field.replace("heroPanel-", ""));
      const next = [...((gv("heroImages") as string[]) ?? [])];
      while (next.length < 3) next.push("");
      next[i] = urls[0];
      sv("heroImages", next);
    } else if (field.startsWith("trip-")) {
      const i = Number(field.replace("trip-", ""));
      sv(`upcomingTrips.${i}.image`, urls[0]);
    }
    setPicker(null);
  };

  // ── Undo / redo / reset history ───────────────────────────────────────────────
  // All content (including every image) lives in react-hook-form, so a snapshot is
  // just the form values. Restore = form.reset + editorKey bump (remounts the
  // inline editors so they re-read the restored values).
  const history = useUndoRedo<any>({
    getSnapshot: () => structuredClone(form.getValues()),
    applySnapshot: (s) => {
      form.reset(structuredClone(s));
      setEditorKey((k) => k + 1);
    },
  });

  // Warn before navigating away with unsaved edits (links, browser back,
  // refresh/close, and the in-form "Back to Resident Hosts" button).
  const leaveGuard = useUnsavedChangesGuard({ isDirty: history.isDirty, onLeave: onClose });

  // Record on any RHF change (text, add/remove, image setValue, gallery edits).
  useEffect(() => {
    const sub = form.watch(() => history.record());
    return () => sub.unsubscribe();
  }, [form, history.record]);

  // Establish the baseline once a host has loaded (deferred so the just-reset form
  // is readable). Reset reverts here; the load isn't an undo step.
  useEffect(() => {
    const raf = requestAnimationFrame(() => history.rebase());
    return () => cancelAnimationFrame(raf);
  }, [host?.id, history.rebase]);

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
    toast({ title: "Changes discarded", description: "The page was reverted to its last saved state." });
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const cleanedHeroImages = ((data.heroImages as string[]) ?? []).filter(Boolean);
      await onSubmit({ ...data, heroImages: cleanedHeroImages });
      toast({
        title: host ? "Saved" : "Created",
        description: host ? "Resident host updated successfully." : "New resident host created.",
      });
      // Make the saved state the new baseline so "Reset" reverts to it.
      requestAnimationFrame(() => history.rebase());
    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Failed to save resident host.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const pickerAspect =
    picker?.field === "hero" ? 16 / 9
    : picker?.field === "profile" ? 1
    : picker?.field.startsWith("heroPanel-") ? 3 / 4
    : 4 / 3;

  const previewSlide = gallerySlides[gallerySlideIdx] ?? gallerySlides[0] ?? [];

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
            Back to Resident Hosts
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

            <div className="flex items-center gap-1.5 text-xs text-dark-gray">
              <Switch checked={w("comingSoon") ?? false} onCheckedChange={(v) => sv("comingSoon", v)}
                className="scale-75 data-[state=checked]:bg-vivid-orange" />
              <span>Coming Soon</span>
            </div>

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
              className={`flex items-center gap-1.5 h-9 px-4 rounded-full border font-body text-sm transition-colors ${panelOpen ? "border-crimson-red bg-crimson-red/5 text-crimson-red" : "border-border text-midnight hover:bg-light-grey"}`}>
              <Settings className="h-4 w-4" />
              Settings
            </button>

            <Button type="button" disabled={isSubmitting}
              onClick={form.handleSubmit(handleSubmit, (errs) => {
                console.error("Form validation errors:", errs);
                toast({ title: "Validation error", description: "Check required fields (name, page title, slug) and try again.", variant: "destructive" });
              })}
              className="h-9 bg-crimson-red hover:bg-light-red text-white rounded-full px-5 font-body font-bold text-sm shadow-small">
              <Save className="h-4 w-4 mr-1.5" />
              {isSubmitting ? "Saving…" : host ? "Save Changes" : "Create Host"}
            </Button>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit, (errs) => console.error("Form validation errors:", errs))}>

          {/* ── HERO ─────────────────────────────────────────────────────── */}
          <section className="group/img relative h-[260px] w-full overflow-hidden md:h-[360px]">
            {triPanel ? (
              <div className="absolute inset-0 grid grid-cols-3">
                {heroImages.slice(0, 3).map((src, i) => (
                  <button key={i} type="button"
                    onClick={() => setPicker({ field: `heroPanel-${i}`, initialUrl: resolveImg(src) || undefined })}
                    className="relative h-full w-full overflow-hidden">
                    <img src={resolveImg(src)} alt="" className="h-full w-full object-cover object-center" />
                  </button>
                ))}
              </div>
            ) : heroImage ? (
              <img src={resolveImg(heroImage)} alt={w("heroImageAlt") ?? ""} className="absolute inset-0 h-full w-full object-cover object-center" />
            ) : (
              <div className="absolute inset-0 bg-crimson-red" />
            )}
            <div className="absolute inset-0 bg-black/40" />

            {/* Hero image controls (single / none) */}
            {!triPanel && (
              <div className="absolute right-4 top-4 z-10 flex gap-2 opacity-0 transition-opacity group-hover/img:opacity-100">
                <button type="button" onClick={() => setPicker({ field: "hero", initialUrl: resolveImg(heroImage) || undefined })}
                  className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-midnight shadow-small hover:text-crimson-red">
                  <Camera className="h-3.5 w-3.5" /> {heroImage ? "Change hero" : "Add hero"}
                </button>
                {heroImage && (
                  <button type="button" onClick={() => sv("heroImage", null)}
                    className="grid size-8 place-items-center rounded-full bg-crimson-red text-white shadow-small">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <InlineInput
                value={pageTitle ?? ""}
                onChange={(v) => sv("pageTitle", v)}
                placeholder="Travel with…"
                className="font-display text-h1-mobile md:text-h1-desktop text-white text-center placeholder:text-white/40"
              />
              <span className="mt-2 inline-flex items-center justify-center rounded-full bg-white px-6 py-3 font-body font-medium text-midnight select-none">
                View Upcoming Trips
              </span>
            </div>
          </section>

          {/* ── INTRO ────────────────────────────────────────────────────── */}
          <section className="relative w-full bg-light-grey">
            <div className="mx-auto w-full max-w-5xl px-4 pt-16 pb-12 md:px-8 md:pt-24 md:pb-16">
              <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-[220px_1fr] md:gap-20">
                {/* Profile column */}
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="group/img relative h-64 w-64 overflow-hidden rounded-full ring-4 ring-white shadow-medium bg-light-grey">
                    {profileImage ? (
                      <>
                        <img src={resolveImg(profileImage)} alt={displayName} className="h-full w-full object-cover object-top" />
                        <ImageEditOverlay
                          onEdit={() => setPicker({ field: "profile", initialUrl: resolveImg(profileImage) || undefined })}
                          onRemove={() => sv("profileImage", "")}
                        />
                      </>
                    ) : (
                      <button type="button" onClick={() => setPicker({ field: "profile" })}
                        className="flex h-full w-full flex-col items-center justify-center gap-1 text-dark-gray/40 hover:bg-light-grey/70">
                        <Camera className="h-7 w-7" />
                        <span className="text-xs">Add photo</span>
                      </button>
                    )}
                  </div>
                  <InlineInput value={displayName ?? ""} onChange={(v) => sv("displayName", v)} placeholder="Name"
                    className="font-sans text-h6-mobile md:text-h6-desktop text-midnight font-bold text-center" />
                  <div className="flex items-center gap-1.5 font-body text-b4-desktop text-dark-gray">
                    <InstagramIcon />
                    <InlineInput value={instagram ?? ""} onChange={(v) => sv("instagram", v.replace(/^@/, ""))} placeholder="instagram" className="text-center" />
                  </div>
                </div>

                {/* Content column */}
                <div>
                  <EditZone label="Heading">
                    <InlineTextarea value={pageTitle ?? ""} onChange={(v) => sv("pageTitle", v)} placeholder="Travel with…"
                      className="font-sans text-h3-mobile md:text-h3-desktop text-midnight" />
                  </EditZone>
                  <div className="mt-5 flex flex-col gap-4">
                    {introFields.map((field, i) => (
                      <div key={field.id} className="group/para flex items-start gap-2">
                        <InlineTextarea value={w(`intro.${i}`) ?? ""} onChange={(v) => sv(`intro.${i}`, v)} placeholder="Intro paragraph…"
                          className="font-body text-b2-mobile md:text-b2-desktop text-dark-gray" />
                        <button type="button" onClick={() => rmIntro(i)}
                          className="mt-1 opacity-0 group-hover/para:opacity-100 transition-opacity text-crimson-red shrink-0">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => (addIntro as any)("")}
                      className="flex items-center gap-1 font-body text-b4-desktop text-crimson-red hover:text-light-red">
                      <Plus className="h-4 w-4" /> Add paragraph
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── UPCOMING TRIPS ───────────────────────────────────────────── */}
          <section id="upcoming-trips" className="bg-light-grey">
            <div className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8 md:py-16">
              <div className="mb-8 text-center md:mb-12">
                <h2 className="font-sans text-h3-mobile md:text-h3-desktop text-midnight">
                  Upcoming Trips with {displayName || "…"}
                </h2>
              </div>

              <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {tripFields.map((field, i) => {
                  const trip = trips[i] ?? {};
                  const isTBA = !trip.duration;
                  return (
                    <li key={field.id} className="group/card relative flex h-full flex-col overflow-hidden rounded-lg bg-white shadow-small">
                      {/* Remove card */}
                      <button type="button" onClick={() => rmTrip(i)}
                        className="absolute right-2 top-2 z-20 grid size-7 place-items-center rounded-full bg-white/90 text-crimson-red opacity-0 shadow-small transition-opacity group-hover/card:opacity-100">
                        <X className="h-4 w-4" />
                      </button>

                      {/* Image */}
                      <div className="group/img relative aspect-[4/3] w-full overflow-hidden bg-light-grey">
                        {trip.image ? (
                          <>
                            <img src={resolveImg(trip.image)} alt={trip.imageAlt ?? trip.name}
                              className={`h-full w-full object-cover ${isTBA ? "brightness-75" : ""}`} />
                            <ImageEditOverlay
                              onEdit={() => setPicker({ field: `trip-${i}`, initialUrl: resolveImg(trip.image) || undefined })}
                              onRemove={() => sv(`upcomingTrips.${i}.image`, "")}
                            />
                          </>
                        ) : (
                          <button type="button" onClick={() => setPicker({ field: `trip-${i}` })}
                            className="flex h-full w-full flex-col items-center justify-center gap-1 text-dark-gray/40 hover:bg-light-grey/70">
                            <ImageIcon className="h-7 w-7" />
                            <span className="text-xs">Add image</span>
                          </button>
                        )}
                        {/* Duration / Coming Soon pill */}
                        <div className="absolute bottom-3 left-3 z-10">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-body text-b4-desktop backdrop-blur-sm ${isTBA ? "bg-midnight/60 text-white/80" : "bg-white/90 text-midnight shadow-xxsmall"}`}>
                            <Calendar className="h-3 w-3" />
                            <InlineInput value={trip.duration ?? ""} onChange={(v) => sv(`upcomingTrips.${i}.duration`, v)} placeholder="Coming Soon"
                              className={isTBA ? "text-white/80 placeholder:text-white/60" : "text-midnight"} />
                          </span>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex flex-1 flex-col p-5 md:p-6">
                        <InlineInput value={trip.name ?? ""} onChange={(v) => sv(`upcomingTrips.${i}.name`, v)} placeholder="Trip name"
                          className={`font-sans text-h5-mobile md:text-h5-desktop ${isTBA ? "text-dark-gray" : "text-midnight"}`} />
                        <InlineTextarea value={trip.description ?? ""} onChange={(v) => sv(`upcomingTrips.${i}.description`, v)} placeholder="Short description…"
                          className="mt-2 font-body text-b4-mobile md:text-b4-desktop text-dark-gray" />

                        <div className="mt-auto pt-5 flex items-end justify-between gap-3">
                          <div className="flex flex-col gap-0.5">
                            <InlineInput value={trip.dates ?? ""} onChange={(v) => sv(`upcomingTrips.${i}.dates`, v)} placeholder="Dates (e.g. March 19, 2027)"
                              className="font-body text-b4-desktop text-dark-gray" />
                            <div className="flex items-baseline gap-1.5">
                              <span className="font-body text-b4-desktop text-dark-gray">From</span>
                              <InlineInput value={trip.price ?? ""} onChange={(v) => sv(`upcomingTrips.${i}.price`, v)} placeholder="GBP £—"
                                className="font-sans text-h6-mobile md:text-h6-desktop text-midnight" />
                            </div>
                            <InlineInput value={trip.priceNote ?? ""} onChange={(v) => sv(`upcomingTrips.${i}.priceNote`, v)} placeholder="price note (optional)"
                              className="font-body text-b4-mobile text-grey" />
                          </div>
                        </div>

                        {/* Edit-only controls: link to an existing tour (stores its ID;
                            www resolves the live slug so the link never goes stale). */}
                        {(() => {
                          const linkedId = trip.tourId || tours.find((t) => t.slug === trip.tourSlug)?.id || "";
                          return (
                            <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-light-grey p-2">
                              <Link2 className="h-3.5 w-3.5 shrink-0 text-dark-gray/50" />
                              <select
                                value={linkedId}
                                onChange={(e) => {
                                  const id = e.target.value;
                                  const t = tours.find((x) => x.id === id);
                                  sv(`upcomingTrips.${i}.tourId`, id || undefined);
                                  sv(`upcomingTrips.${i}.tourSlug`, t?.slug ?? "");
                                }}
                                className="flex-1 rounded-md border border-border bg-white px-2 py-1 text-xs text-dark-gray outline-none focus:ring-2 focus:ring-crimson-red/40"
                              >
                                <option value="">— Link a tour (optional) —</option>
                                {tours.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}{t.status !== "active" ? ` (${t.status})` : ""}
                                  </option>
                                ))}
                              </select>
                              {linkedId && (
                                <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-crimson-red px-3 py-1 font-body text-b4-desktop font-medium text-white opacity-80">
                                  View Tour <ArrowRight className="h-3 w-3" />
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </li>
                  );
                })}

                {/* Add trip card */}
                <li>
                  <button type="button"
                    onClick={() => (addTrip as any)({ name: "", dates: "TBA", tourId: "", tourSlug: "", image: "", imageAlt: "", duration: "", description: "", price: "", priceNote: "", comingSoon: false })}
                    className="flex h-full min-h-[280px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-crimson-red/40 text-crimson-red transition-colors hover:border-crimson-red hover:bg-crimson-red/5">
                    <Plus className="h-6 w-6" />
                    <span className="font-body text-sm font-semibold">Add Trip</span>
                  </button>
                </li>
              </ul>
            </div>
          </section>

          {/* ── WHY TRAVEL WITH US ───────────────────────────────────────── */}
          <section className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8 md:py-16">
            <div className="mb-10 text-center">
              <h2 className="font-sans text-h3-mobile md:text-h3-desktop text-midnight">Why Travel With Us</h2>
            </div>
            <div className="flex gap-5 overflow-x-auto pb-2 scrollbar-hide">
              {whyFields.map((field, i) => (
                <div key={field.id} className="group/why relative w-80 shrink-0 rounded-lg bg-white p-5 shadow-small">
                  <button type="button" onClick={() => rmWhy(i)}
                    className="absolute right-2 top-2 opacity-0 group-hover/why:opacity-100 transition-opacity text-crimson-red">
                    <X className="h-4 w-4" />
                  </button>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <span className="inline-flex w-fit items-center rounded-full bg-crimson-red px-2.5 py-1 font-body text-b4-desktop font-medium text-white">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <InlineTextarea value={w(`whyTravel.${i}`) ?? ""} onChange={(v) => sv(`whyTravel.${i}`, v)} placeholder="Reason to travel"
                    className="mb-2 font-sans text-h6-mobile md:text-h6-desktop text-midnight" />
                  <InlineTextarea value={w(`whyTravelNotes.${i}`) ?? ""} onChange={(v) => sv(`whyTravelNotes.${i}`, v)} placeholder="Supporting note (optional)"
                    className="font-body text-b4-desktop text-dark-gray" />
                </div>
              ))}
              <button type="button" onClick={addWhy}
                className="flex w-80 shrink-0 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-crimson-red/40 p-5 text-crimson-red transition-colors hover:border-crimson-red hover:bg-crimson-red/5">
                <Plus className="h-6 w-6" />
                <span className="font-body text-sm font-semibold">Add Reason</span>
              </button>
            </div>
          </section>

          {/* ── REAL MOMENTS (gallery) ───────────────────────────────────── */}
          <section className="bg-light-grey">
            <div className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8 md:py-16">
              <div className="mb-8 flex items-center justify-between gap-4">
                <h2 className="font-sans text-h3-mobile md:text-h3-desktop text-midnight">Real Moments from Our Trips</h2>
                <div className="flex items-center gap-3">
                  {gallerySlides.length > 1 && (
                    <div className="flex items-center gap-1">
                      {gallerySlides.map((_, si) => (
                        <button key={si} type="button" onClick={() => setGallerySlideIdx(si)}
                          className={`size-2 rounded-full ${si === gallerySlideIdx ? "bg-crimson-red" : "bg-grey/40"}`}
                          title={`Slide ${si + 1}`} />
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={() => setGalleryModalOpen(true)}
                    className="flex items-center gap-1.5 rounded-full border border-crimson-red bg-crimson-red/5 px-4 py-1.5 text-sm font-medium text-crimson-red transition-colors hover:bg-crimson-red/10">
                    <Pencil className="h-3.5 w-3.5" /> Edit gallery
                  </button>
                </div>
              </div>

              {previewSlide.length > 0 ? (
                <div className="flex gap-2 sm:gap-2.5">
                  {previewSlide.map((col, ci) => (
                    <div key={ci} className="flex flex-1 flex-col gap-2 sm:gap-2.5">
                      {col.map((item, ii) => (
                        <div key={`${ci}-${ii}`}
                          className={`relative w-full overflow-hidden rounded-md bg-grey/10 ${item.size === "tall" ? "aspect-[308/397]" : "aspect-[308/199]"}`}>
                          {item.type === "photo" && item.src && (
                            <img src={resolveImg(item.src)} alt={item.alt ?? "Trip moment"} className="absolute inset-0 h-full w-full object-cover"
                              style={item.objectPosition ? { objectPosition: item.objectPosition } : undefined} />
                          )}
                          {item.type === "video" && item.src && (
                            <video src={resolveImg(item.src)} autoPlay loop muted playsInline className="absolute inset-0 h-full w-full object-cover" />
                          )}
                          {item.type === "placeholder" && <div className="absolute inset-0 bg-grey/15" />}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <button type="button" onClick={() => setGalleryModalOpen(true)}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-crimson-red/40 py-16 text-crimson-red transition-colors hover:border-crimson-red hover:bg-crimson-red/5">
                  <ImageIcon className="h-8 w-8" />
                  <span className="font-body text-sm font-semibold">Add gallery slides</span>
                </button>
              )}
            </div>
          </section>

          {/* ── HOW IT WORKS ─────────────────────────────────────────────── */}
          <section className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8 md:py-16">
            <div className="mb-12 text-center">
              <h2 className="font-sans text-h3-mobile md:text-h3-desktop text-midnight">How It Works</h2>
            </div>
            <ul className="relative grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4 md:gap-x-0">
              <div aria-hidden className="pointer-events-none absolute hidden md:block"
                style={{ top: 28, left: "12.5%", right: "12.5%", borderTop: "2px dashed #d1d5db" }} />
              {howFields.map((field, i) => (
                <li key={field.id} className="group/step relative">
                  <div className="flex flex-col items-center text-center">
                    <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-crimson-red shadow-small">
                      <span className="font-display text-h4-mobile text-white leading-none">{i + 1}</span>
                    </div>
                    <InlineTextarea value={w(`howItWorks.${i}`) ?? ""} onChange={(v) => sv(`howItWorks.${i}`, v)} placeholder="Step description"
                      className="mt-5 px-2 font-sans font-bold text-b2-mobile md:text-b2-desktop text-midnight text-center" />
                    <button type="button" onClick={() => rmHow(i)}
                      className="mt-1 opacity-0 group-hover/step:opacity-100 transition-opacity text-crimson-red">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
              <li className="flex items-start justify-center">
                <button type="button" onClick={() => (addHow as any)("")}
                  className="mt-1 flex flex-col items-center gap-2 text-crimson-red hover:text-light-red">
                  <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-dashed border-crimson-red/40">
                    <Plus className="h-5 w-5" />
                  </span>
                  <span className="font-body text-sm font-semibold">Add step</span>
                </button>
              </li>
            </ul>
          </section>
        </form>

        <ResidentHostSettingsPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          form={form}
          host={host ?? null}
          onPickImage={(field, initialUrl) => setPicker({ field, initialUrl })}
        />
      </Form>

      {/* Gallery edit modal */}
      {galleryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setGalleryModalOpen(false)} aria-hidden />
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-light-grey px-6 py-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-crimson-red" />
                <span className="font-sans font-bold text-midnight text-sm">Real Moments — Gallery</span>
              </div>
              <button type="button" onClick={() => setGalleryModalOpen(false)}
                className="flex size-7 items-center justify-center rounded-full text-dark-gray hover:bg-light-grey hover:text-midnight transition-colors">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-light-grey/40 p-5 scrollbar-hide">
              <GallerySlidesEditor form={form} storageFolder={w("slug") ? `images/resident-hosts/${w("slug")}` : "images/resident-hosts"} />
            </div>
            <div className="flex items-center justify-end border-t border-light-grey px-6 py-3">
              <button type="button" onClick={() => setGalleryModalOpen(false)}
                className="rounded-full bg-crimson-red px-5 py-2 text-sm font-bold text-white hover:bg-light-red">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image picker */}
      {picker && (
        <ImagePickerModal
          open
          onClose={() => setPicker(null)}
          onConfirm={handlePickerConfirm}
          storageFolder={w("slug") ? `images/resident-hosts/${w("slug")}` : "images/resident-hosts"}
          aspectRatio={pickerAspect}
          initialImageUrl={picker.initialUrl}
          title={
            picker.field === "hero" ? "Select Hero Image"
            : picker.field === "profile" ? "Select Profile Image"
            : picker.field.startsWith("heroPanel-") ? "Select Split-Hero Image"
            : "Select Trip Image"
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
    </div>
  );
}

// ─── Small inline icon (matches www IntroSection) ─────────────────────────────
function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  );
}
