"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Loader2,
  Lock,
  Package,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import DateTimePicker from "@/components/DateTimePicker";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { uploadSaleBanner } from "@/utils/file-upload";
import {
  SaleEventsService,
  describeSaleError,
  type SaleInput,
  type SaleWithInventory,
} from "@/services/sale-events-service";
import type { SaleCheckoutMode, SaleSlot, SaleStatus } from "@/types/sale-events";
import type { TourPackage } from "@/types/tours";
import TourPicker from "./TourPicker";
import {
  DEFAULT_SLOTS,
  MAX_SLOTS,
  SALE_STATUS_META,
  SLOT_STATUS_META,
  formatGBP,
  isSlotLocked,
  isoToLocalInput,
  localInputToIso,
  matchCsvTour,
  numOrNaN,
  parseSaleCsv,
  salePriceFor,
  slotDisplayStatus,
  slugify,
  useNow,
  type CsvTourGroup,
} from "./sale-utils";

// ---------------------------------------------------------------------------
// Draft model
// ---------------------------------------------------------------------------

let seq = 0;
const newKey = () => `k${++seq}`;

interface DraftTour {
  key: string;
  tourPackageId: string;
  tourSlug: string;
  tourName: string;
  coverImage?: string;
  displayName: string;
  originalPrice: string;
  /** Discount £ per position (slot 1 first), as typed. */
  discounts: { key: string; value: string }[];
  /** CSV import notes for this tour. */
  notes: string[];
}

interface UnmatchedGroup {
  key: string;
  group: CsvTourGroup;
  candidates: TourPackage[];
  reason?: string;
}

const SECTIONS = [
  { id: "page", title: "Page", icon: FileText },
  { id: "banners", title: "Banners", icon: ImageIcon },
  { id: "tours", title: "Tours & slots", icon: Package },
] as const;

const STATUS_HELP: Record<SaleStatus, string> = {
  draft: "Not public. Set to Live when ready.",
  live: "Customers can hold slots between the start and end time.",
  paused: "No new holds. Existing holds can still be paid.",
  ended: "Sale is over. No new holds.",
};

function draftFromSale(sale: SaleWithInventory): DraftTour[] {
  return sale.tours.map((t) => {
    const slots = sale.inventory[t.tourPackageId]?.slots ?? [];
    const discounts = slots.length
      ? slots.map((s) => ({ key: newKey(), value: String(s.discountGBP) }))
      : Array.from({ length: DEFAULT_SLOTS }, () => ({ key: newKey(), value: "" }));
    return {
      key: newKey(),
      tourPackageId: t.tourPackageId,
      tourSlug: t.tourSlug,
      tourName: t.tourName,
      coverImage: t.coverImage,
      displayName: t.displayName,
      originalPrice: String(t.originalPrice),
      discounts,
      notes: [],
    };
  });
}

function draftFromTour(tour: TourPackage, csv?: CsvTourGroup): DraftTour {
  const ladder = csv?.ladder ?? [];
  return {
    key: newKey(),
    tourPackageId: tour.id,
    tourSlug: tour.slug ?? "",
    tourName: tour.name ?? "",
    coverImage: tour.media?.coverImage || undefined,
    displayName: (tour.cardSubHeader || tour.name || "").slice(0, 80),
    originalPrice: String(csv?.originalPrice ?? tour.pricing?.original ?? 0),
    discounts: ladder.length
      ? ladder.map((d) => ({ key: newKey(), value: String(d) }))
      : Array.from({ length: DEFAULT_SLOTS }, () => ({ key: newKey(), value: "" })),
    notes: [],
  };
}

function csvNotes(group: CsvTourGroup, tour: TourPackage): string[] {
  const notes = [...group.warnings];
  const tourPrice = tour.pricing?.original;
  if (group.originalPrice !== null && typeof tourPrice === "number" && Math.abs(group.originalPrice - tourPrice) > 0.009) {
    notes.unshift(`CSV original price ${formatGBP(group.originalPrice)} differs from the tour's price ${formatGBP(tourPrice)}`);
  }
  return notes;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SaleEventEditorProps {
  /** Mount with a fresh `key` per editing session; state initialises on mount. */
  sale: SaleWithInventory | null;
  tours: TourPackage[];
  isFirstSale: boolean;
  onClose: () => void;
  onSaved: (id: string) => void;
}

export default function SaleEventEditor({ sale, tours, isFirstSale, onClose, onSaved }: SaleEventEditorProps) {
  const { toast } = useToast();
  const now = useNow(15_000);
  const isEdit = !!sale;

  const defaultName = isFirstSale ? "Black Friday" : "";
  const [name, setName] = useState(sale?.name ?? defaultName);
  const [slug, setSlug] = useState(sale?.slug ?? (isFirstSale ? "black-friday" : ""));
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [status, setStatus] = useState<SaleStatus>(sale?.status ?? "draft");
  const [startLocal, setStartLocal] = useState(isoToLocalInput(sale?.startAt));
  const [endTba, setEndTba] = useState(sale ? sale.endAt === null : true);
  const [endLocal, setEndLocal] = useState(isoToLocalInput(sale?.endAt));
  const [holdMinutes, setHoldMinutes] = useState(String(sale?.holdMinutes ?? 15));
  const [checkoutMode, setCheckoutMode] = useState<SaleCheckoutMode>(sale?.checkoutMode ?? "auto");
  const [heroTitle, setHeroTitle] = useState(sale?.hero.title ?? (isFirstSale ? "Black Friday Sale" : ""));
  const [heroSubtitle, setHeroSubtitle] = useState(sale?.hero.subtitle ?? "");
  const [bannerUrl, setBannerUrl] = useState(sale?.hero.bannerUrl ?? "");
  const [mobileBannerUrl, setMobileBannerUrl] = useState(sale?.hero.mobileBannerUrl ?? "");
  const [uploading, setUploading] = useState<{ desktop: boolean; mobile: boolean }>({ desktop: false, mobile: false });
  const [draftTours, setDraftTours] = useState<DraftTour[]>(() => (sale ? draftFromSale(sale) : []));
  const [unmatched, setUnmatched] = useState<UnmatchedGroup[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("page");
  const scrollRef = useRef<HTMLDivElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Draft tours can be sold in a sale too (they just have no public tour page); archived can't.
  const activeTours = useMemo(
    () =>
      tours
        .filter((t) => t.status === "active" || t.status === "draft")
        .sort(
          (a, b) =>
            Number(a.status !== "active") - Number(b.status !== "active") || (a.name ?? "").localeCompare(b.name ?? ""),
        ),
    [tours],
  );
  const tourById = useMemo(() => new Map(tours.map((t) => [t.id, t])), [tours]);
  const inSale = useMemo(() => new Set(draftTours.map((t) => t.tourPackageId)), [draftTours]);

  const invSlot = (tourPackageId: string, position: number): SaleSlot | undefined =>
    sale?.inventory[tourPackageId]?.slots.find((s) => s.index === position + 1);
  const locked = (tourPackageId: string, position: number) => isSlotLocked(invSlot(tourPackageId, position), now);
  const tourHasLocked = (t: DraftTour) =>
    (sale?.inventory[t.tourPackageId]?.slots ?? []).some((s) => isSlotLocked(s, now));

  // Unsaved-changes detection.
  const snapshot = JSON.stringify([
    name, slug, status, startLocal, endTba, endLocal, holdMinutes, checkoutMode, heroTitle, heroSubtitle,
    bannerUrl, mobileBannerUrl, draftTours.map((t) => [t.tourPackageId, t.displayName, t.originalPrice, t.discounts.map((d) => d.value)]),
    unmatched.length,
  ]);
  const initialSnapshot = useRef(snapshot);
  const dirty = snapshot !== initialSnapshot.current;

  function requestClose() {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  // ---- Section nav --------------------------------------------------------

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const top = el.scrollTop;
      let current: string = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const node = el.querySelector<HTMLElement>(`#sale-section-${s.id}`);
        if (node && node.offsetTop - 96 <= top) current = s.id;
      }
      if (el.scrollHeight - top - el.clientHeight < 8) current = SECTIONS[SECTIONS.length - 1].id;
      setActiveSection(current);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  function scrollToSection(id: string) {
    const el = scrollRef.current;
    const node = el?.querySelector<HTMLElement>(`#sale-section-${id}`);
    if (el && node) el.scrollTo({ top: node.offsetTop - 16, behavior: "smooth" });
  }

  // ---- Page fields ----------------------------------------------------------

  function onNameChange(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  async function onBannerFile(kind: "desktop" | "mobile", file: File | undefined) {
    if (!file) return;
    setUploading((u) => ({ ...u, [kind]: true }));
    try {
      const res = await uploadSaleBanner(file);
      if (!res.success || !res.data?.publicUrl) throw new Error(res.error || "Upload failed");
      (kind === "desktop" ? setBannerUrl : setMobileBannerUrl)(res.data.publicUrl);
      toast({ title: `${kind === "desktop" ? "Desktop" : "Mobile"} banner uploaded` });
    } catch (e) {
      toast({ title: "Banner upload failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setUploading((u) => ({ ...u, [kind]: false }));
    }
  }

  // ---- Tours ----------------------------------------------------------------

  const patchTour = (key: string, patch: Partial<DraftTour> | ((t: DraftTour) => Partial<DraftTour>)) =>
    setDraftTours((prev) => prev.map((t) => (t.key === key ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t)));

  function addTour(tour: TourPackage) {
    if (inSale.has(tour.id)) return;
    setDraftTours((prev) => [...prev, draftFromTour(tour)]);
  }

  function moveTour(i: number, dir: -1 | 1) {
    setDraftTours((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function setDiscount(t: DraftTour, pos: number, value: string) {
    patchTour(t.key, { discounts: t.discounts.map((d, i) => (i === pos ? { ...d, value } : d)) });
  }

  function moveSlot(t: DraftTour, pos: number, dir: -1 | 1) {
    const j = pos + dir;
    if (j < 0 || j >= t.discounts.length || locked(t.tourPackageId, pos) || locked(t.tourPackageId, j)) return;
    const next = [...t.discounts];
    [next[pos], next[j]] = [next[j], next[pos]];
    patchTour(t.key, { discounts: next });
  }

  /** A row can go when it's free and nothing locked sits after it (positions would shift). */
  const canRemoveSlot = (t: DraftTour, pos: number) =>
    t.discounts.length > 1 && t.discounts.every((_, i) => i < pos || !locked(t.tourPackageId, i));

  function removeSlot(t: DraftTour, pos: number) {
    if (!canRemoveSlot(t, pos)) return;
    patchTour(t.key, { discounts: t.discounts.filter((_, i) => i !== pos) });
  }

  function addSlot(t: DraftTour) {
    if (t.discounts.length >= MAX_SLOTS) return;
    const last = t.discounts[t.discounts.length - 1]?.value ?? "";
    patchTour(t.key, { discounts: [...t.discounts, { key: newKey(), value: last }] });
  }

  /** Applies a CSV group to a tour, keeping the price of slots that are held or sold. */
  function applyGroup(prev: DraftTour[], group: CsvTourGroup, tour: TourPackage): DraftTour[] {
    const notes = csvNotes(group, tour);
    const existing = prev.find((t) => t.tourPackageId === tour.id);
    if (!existing) return [...prev, { ...draftFromTour(tour, group), notes }];
    const len = Math.max(group.ladder.length, ...existing.discounts.map((_, i) => (locked(tour.id, i) ? i + 1 : 0)));
    const discounts = Array.from({ length: len }, (_, i) => {
      const cur = existing.discounts[i];
      if (cur && locked(tour.id, i)) return cur;
      return { key: cur?.key ?? newKey(), value: String(group.ladder[i] ?? cur?.value ?? "") };
    });
    if (discounts.some((_, i) => locked(tour.id, i))) notes.push("Held/sold slots kept their current discount");
    return prev.map((t) =>
      t.key === existing.key
        ? { ...t, discounts, notes, originalPrice: group.originalPrice !== null ? String(group.originalPrice) : t.originalPrice }
        : t,
    );
  }

  async function onCsvFile(file: File | undefined) {
    if (csvInputRef.current) csvInputRef.current.value = "";
    if (!file) return;
    const { groups, errors } = parseSaleCsv(await file.text());
    if (!groups.length) {
      toast({ title: "Nothing imported", description: errors.join("\n") || "The CSV has no tour rows.", variant: "destructive" });
      return;
    }
    let next = draftTours;
    const pending: UnmatchedGroup[] = [];
    const claimed = new Map<string, string>(); // tourPackageId -> CSV label
    let matched = 0;
    for (const g of groups) {
      const m = matchCsvTour(g.label, activeTours);
      if (m.tour && claimed.has(m.tour.id)) {
        pending.push({ key: newKey(), group: g, candidates: [m.tour], reason: `Also matched by "${claimed.get(m.tour.id)}"` });
      } else if (m.tour) {
        claimed.set(m.tour.id, g.label);
        next = applyGroup(next, g, m.tour);
        matched++;
      } else {
        pending.push({ key: newKey(), group: g, candidates: m.candidates, reason: m.reason });
      }
    }
    setDraftTours(next);
    setUnmatched((u) => [...u, ...pending]);
    toast({
      title: `Imported ${matched} tour${matched === 1 ? "" : "s"}${pending.length ? ` · ${pending.length} need a manual pick` : ""}`,
      description: errors.length ? errors.slice(0, 4).join("\n") : "Check the prices below, then save.",
      variant: errors.length ? "destructive" : undefined,
    });
    scrollToSection("tours");
  }

  function resolveUnmatched(u: UnmatchedGroup, tour: TourPackage) {
    setDraftTours((prev) => applyGroup(prev, u.group, tour));
    setUnmatched((list) => list.filter((x) => x.key !== u.key));
  }

  // ---- Save -----------------------------------------------------------------

  function validate(): { input: SaleInput | null; errors: { section: string; message: string }[] } {
    const errors: { section: string; message: string }[] = [];
    const page = (message: string) => errors.push({ section: "page", message });
    if (!name.trim()) page("Sale name is required");
    if (!/^[a-z0-9-]+$/.test(slug)) page("URL slug can only use lowercase letters, numbers and hyphens");
    const hold = Number(holdMinutes);
    if (!Number.isInteger(hold) || hold < 1 || hold > 60) page("Hold minutes must be a whole number from 1 to 60");
    const startAt = localInputToIso(startLocal);
    const endAt = endTba ? null : localInputToIso(endLocal);
    if (!endTba && !endAt) page("Pick an end date, or turn on “End date TBA”");
    if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) page("End date must be after the start date");
    if (status === "live" && draftTours.length === 0) errors.push({ section: "tours", message: "Add at least one tour before setting the sale live" });
    if (unmatched.length) errors.push({ section: "tours", message: `Pick or skip the ${unmatched.length} unmatched CSV tour(s)` });

    const toursInput = draftTours.map((t, i) => {
      const label = t.displayName || t.tourName || `Tour ${i + 1}`;
      const original = numOrNaN(t.originalPrice);
      if (!t.displayName.trim()) errors.push({ section: "tours", message: `${t.tourName}: display name is required` });
      if (!Number.isFinite(original) || original < 0) errors.push({ section: "tours", message: `${label}: original price must be 0 or more` });
      const ladder = t.discounts.map((d) => numOrNaN(d.value));
      if (ladder.some((d) => !Number.isFinite(d) || d < 0)) errors.push({ section: "tours", message: `${label}: enter a discount (£0 or more) for every slot` });
      return {
        tourPackageId: t.tourPackageId,
        tourSlug: t.tourSlug,
        displayName: t.displayName.trim().slice(0, 80),
        tourName: t.tourName,
        originalPrice: original,
        ...(t.coverImage ? { coverImage: t.coverImage } : {}),
        order: i,
        ladder,
      };
    });
    if (errors.length) return { input: null, errors };
    return {
      errors,
      input: {
        slug,
        name: name.trim(),
        status,
        startAt,
        endAt,
        holdMinutes: hold,
        checkoutMode,
        // Empty strings clear a banner (the API merges hero fields).
        hero: { title: heroTitle.trim(), subtitle: heroSubtitle.trim(), bannerUrl: bannerUrl.trim(), mobileBannerUrl: mobileBannerUrl.trim() },
        tours: toursInput,
      },
    };
  }

  async function save() {
    const { input, errors } = validate();
    if (!input) {
      toast({
        title: errors.length === 1 ? "Fix 1 problem before saving" : `Fix ${errors.length} problems before saving`,
        description: errors.slice(0, 4).map((e) => e.message).join("\n"),
        variant: "destructive",
      });
      scrollToSection(errors[0].section);
      return;
    }
    setSaving(true);
    try {
      const id = sale ? await SaleEventsService.update(sale.id, input) : await SaleEventsService.create(input);
      toast({ title: sale ? "Sale saved" : "Sale created", description: `${input.name} · /${input.slug}` });
      onSaved(id);
    } catch (e) {
      const { title, description } = describeSaleError(e, (id) => tourById.get(id)?.name ?? draftTours.find((t) => t.tourPackageId === id)?.tourName ?? id);
      toast({ title, description, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // ---- Render ---------------------------------------------------------------

  const busy = saving || uploading.desktop || uploading.mobile;
  const heroImage = bannerUrl || mobileBannerUrl;

  return (
    <TooltipProvider delayDuration={200}>
      <Dialog open onOpenChange={(o) => !o && requestClose()}>
        <DialogContent
          className="flex max-h-[92vh] max-w-6xl flex-col gap-0 overflow-hidden p-0"
          onInteractOutside={(e) => {
            // Keep the editor open on outside clicks; unsaved work matters here.
            e.preventDefault();
          }}
        >
          <DialogHeader className="relative overflow-hidden rounded-t-lg px-8 pb-6 pt-8 text-white">
            {heroImage ? (
              <div className="absolute inset-0 z-0" aria-hidden>
                <div
                  className="absolute inset-0 scale-110 bg-cover bg-center"
                  style={{ backgroundImage: `url(${heroImage})`, filter: "blur(20px)" }}
                />
                <div className="absolute inset-0 bg-black/60" />
              </div>
            ) : (
              <div className="absolute inset-0 bg-gradient-to-r from-crimson-red to-light-red" aria-hidden />
            )}
            <div className="relative z-10">
              <DialogTitle className="mb-2 text-3xl font-bold text-white drop-shadow-lg">
                {isEdit ? `Edit ${sale.name}` : "Create Sale Event"}
              </DialogTitle>
              <DialogDescription className="text-lg text-white/90 drop-shadow-md">
                A sale page with limited discounted slots per tour. Slot 1 sells first.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div ref={scrollRef} className="relative min-w-0 flex-1 overflow-y-auto p-6">
              <div className="flex flex-col gap-6">
                {/* ------------------------------------------------ Page */}
                <Card id="sale-section-page" className="scroll-mt-4 border border-border bg-background shadow-md">
                  <SectionHeader icon={FileText} title="Page" description="Name, URL, schedule and checkout" />
                  <CardContent className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="sale-name">
                        Sale name <span className="text-crimson-red" aria-hidden>*</span>
                      </Label>
                      <Input id="sale-name" value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="e.g. Black Friday" maxLength={120} required />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="sale-slug">
                        URL slug <span className="text-crimson-red" aria-hidden>*</span>
                      </Label>
                      <div className="flex items-center rounded-md border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                        <span className="select-none pl-3 text-sm text-muted-foreground">imheretravels.com/</span>
                        <Input
                          id="sale-slug"
                          value={slug}
                          onChange={(e) => {
                            setSlugTouched(true);
                            setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80));
                          }}
                          onBlur={() => setSlug((s) => s.replace(/-+/g, "-").replace(/^-|-$/g, ""))}
                          className="border-0 pl-0.5 focus-visible:ring-0 focus-visible:ring-offset-0"
                          aria-describedby="sale-slug-help"
                          required
                        />
                      </div>
                      <p id="sale-slug-help" className="text-xs text-muted-foreground">
                        Lowercase letters, numbers and hyphens.
                        {isEdit && sale.slug !== slug && " Changing it breaks links already shared."}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="sale-status">Status</Label>
                      <Select value={status} onValueChange={(v) => setStatus(v as SaleStatus)}>
                        <SelectTrigger id="sale-status" aria-describedby="sale-status-help">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(SALE_STATUS_META) as SaleStatus[]).map((s) => (
                            <SelectItem key={s} value={s}>
                              {SALE_STATUS_META[s].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p id="sale-status-help" className="text-xs text-muted-foreground">
                        {STATUS_HELP[status]}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="sale-hold">Hold minutes</Label>
                      <Input
                        id="sale-hold"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={60}
                        step={1}
                        value={holdMinutes}
                        onChange={(e) => setHoldMinutes(e.target.value)}
                        aria-describedby="sale-hold-help"
                      />
                      <p id="sale-hold-help" className="text-xs text-muted-foreground">
                        How long a customer keeps their slot while filling in the reservation form.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label>Start</Label>
                      <DateTimePicker value={startLocal} onChange={setStartLocal} label="Start immediately" />
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {startLocal ? "Holds open at this time (your local time)." : "No start time: opens as soon as it's Live."}
                          {startLocal && localInputToIso(startLocal) && (
                            <span className="block font-medium text-foreground">
                              UK time:{" "}
                              {new Intl.DateTimeFormat("en-GB", {
                                timeZone: "Europe/London",
                                dateStyle: "medium",
                                timeStyle: "short",
                              }).format(new Date(localInputToIso(startLocal)!))}
                            </span>
                          )}
                        </span>
                        {startLocal && (
                          <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setStartLocal("")}>
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="sale-end-tba">End</Label>
                        <div className="flex items-center gap-2">
                          <Switch id="sale-end-tba" checked={endTba} onCheckedChange={setEndTba} />
                          <Label htmlFor="sale-end-tba" className="font-normal">
                            End date TBA
                          </Label>
                        </div>
                      </div>
                      {endTba ? (
                        <p className="rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                          The page shows “End date TBA”. End the sale by setting status to Ended.
                        </p>
                      ) : (
                        <DateTimePicker value={endLocal} onChange={setEndLocal} label="Select end date & time" />
                      )}
                    </div>

                    <fieldset className="flex flex-col gap-2 md:col-span-2">
                      <legend className="mb-2 text-sm font-medium">Checkout</legend>
                      <RadioGroup
                        value={checkoutMode}
                        onValueChange={(v) => setCheckoutMode(v as SaleCheckoutMode)}
                        className="grid grid-cols-1 gap-3 md:grid-cols-2"
                      >
                        {(
                          [
                            ["auto", "Automatic (Stripe)", "Customer pays the reservation fee by card in the reservation form."],
                            ["manual", "Manual payment links", "Customer is shown the payment link you set on their slot in Track slots."],
                          ] as const
                        ).map(([value, title, desc]) => (
                          <Label
                            key={value}
                            htmlFor={`sale-checkout-${value}`}
                            className={cn(
                              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors hover:bg-muted/50",
                              checkoutMode === value && "border-crimson-red bg-crimson-red/5",
                            )}
                          >
                            <RadioGroupItem id={`sale-checkout-${value}`} value={value} className="mt-0.5" />
                            <span className="flex flex-col gap-0.5">
                              <span className="font-medium">{title}</span>
                              <span className="text-xs text-muted-foreground">{desc}</span>
                            </span>
                          </Label>
                        ))}
                      </RadioGroup>
                    </fieldset>

                    <div className="flex flex-col gap-2 md:col-span-2">
                      <Label htmlFor="sale-hero-title">Hero title</Label>
                      <Input id="sale-hero-title" value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} maxLength={120} placeholder="Black Friday Sale" />
                    </div>
                    <div className="flex flex-col gap-2 md:col-span-2">
                      <Label htmlFor="sale-hero-subtitle">Hero subtitle</Label>
                      <Textarea
                        id="sale-hero-subtitle"
                        value={heroSubtitle}
                        onChange={(e) => setHeroSubtitle(e.target.value)}
                        maxLength={400}
                        rows={2}
                        placeholder="Limited slots per tour. The earlier you book, the bigger the discount."
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* ------------------------------------------------ Banners */}
                <Card id="sale-section-banners" className="scroll-mt-4 border border-border bg-background shadow-md">
                  <SectionHeader icon={ImageIcon} title="Banners" description="Hero images for the sale page (JPG, PNG or WebP, max 5MB)" />
                  <CardContent className="grid grid-cols-1 gap-6 pt-4 md:grid-cols-2">
                    <BannerField
                      id="desktop"
                      label="Desktop banner"
                      hint="Wide, about 1920×600"
                      url={bannerUrl}
                      uploading={uploading.desktop}
                      onUrl={setBannerUrl}
                      onFile={(f) => onBannerFile("desktop", f)}
                      aspect="aspect-[16/5]"
                    />
                    <BannerField
                      id="mobile"
                      label="Mobile banner"
                      hint="Tall, about 800×1000. Falls back to desktop."
                      url={mobileBannerUrl}
                      uploading={uploading.mobile}
                      onUrl={setMobileBannerUrl}
                      onFile={(f) => onBannerFile("mobile", f)}
                      aspect="aspect-[4/5] max-h-56"
                    />
                  </CardContent>
                </Card>

                {/* ------------------------------------------------ Tours */}
                <Card id="sale-section-tours" className="scroll-mt-4 border border-border bg-background shadow-md">
                  <SectionHeader
                    icon={Package}
                    title="Tours & slots"
                    description="Each tour has a ladder of discounted slots, sold in order (slot 1 first)."
                  >
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={csvInputRef}
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={(e) => onCsvFile(e.target.files?.[0])}
                        aria-hidden
                        tabIndex={-1}
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => csvInputRef.current?.click()}>
                        <FileSpreadsheet aria-hidden /> Import CSV
                      </Button>
                      <TourPicker tours={activeTours} excludeIds={inSale} onSelect={addTour} size="sm" variant="default" aria-label="Add tour">
                        <Plus aria-hidden /> Add tour
                      </TourPicker>
                    </div>
                  </SectionHeader>
                  <CardContent className="flex flex-col gap-4 pt-4">
                    <p className="text-xs text-muted-foreground">
                      CSV header: <code className="rounded bg-muted px-1">Tour,Slots,Original Price,Discount GBP,Sale Price</code>, e.g.{" "}
                      <code className="rounded bg-muted px-1">Argentina,1,2199,500 OFF,1699</code>. Tours are matched by country label, then name, then slug.
                    </p>

                    {unmatched.length > 0 && (
                      <div role="region" aria-label="Unmatched CSV tours" className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                        <div className="mb-3 flex items-center gap-2 font-medium text-amber-900">
                          <AlertTriangle className="h-4 w-4" aria-hidden />
                          {unmatched.length} CSV tour{unmatched.length === 1 ? "" : "s"} need a manual pick
                        </div>
                        <ul className="flex flex-col gap-2">
                          {unmatched.map((u) => (
                            <li key={u.key} className="flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-background p-3">
                              <div className="min-w-0 flex-1">
                                <div className="font-medium">{u.group.label}</div>
                                <div className="text-xs text-muted-foreground">
                                  {u.group.ladder.length} slots
                                  {u.group.originalPrice !== null && ` · ${formatGBP(u.group.originalPrice)}`} · −
                                  {u.group.ladder.map((d) => formatGBP(d)).join(" / −")}
                                  {u.reason && ` · ${u.reason}`}
                                </div>
                              </div>
                              <TourPicker
                                tours={activeTours}
                                suggested={u.candidates}
                                excludeIds={inSale}
                                onSelect={(t) => resolveUnmatched(u, t)}
                                size="sm"
                                className="w-56"
                                placeholder="Pick tour…"
                                aria-label={`Pick tour for ${u.group.label}`}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setUnmatched((list) => list.filter((x) => x.key !== u.key))}
                              >
                                Skip
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {draftTours.length === 0 ? (
                      <div className="rounded-lg border-2 border-dashed border-crimson-red/30 px-6 py-10 text-center">
                        <Package className="mx-auto mb-3 h-8 w-8 text-crimson-red" aria-hidden />
                        <p className="font-semibold">No tours yet</p>
                        <p className="text-sm text-muted-foreground">Add tours one by one or import the sale CSV.</p>
                      </div>
                    ) : (
                      draftTours.map((t, ti) => {
                        const tour = tourById.get(t.tourPackageId);
                        const original = numOrNaN(t.originalPrice);
                        const tourPrice = tour?.pricing?.original;
                        const priceDiffers = typeof tourPrice === "number" && Number.isFinite(original) && Math.abs(original - tourPrice) > 0.009;
                        const ladder = t.discounts.map((d) => numOrNaN(d.value));
                        const notDescending = ladder.some((d, i) => i > 0 && Number.isFinite(d) && Number.isFinite(ladder[i - 1]) && d > ladder[i - 1]);
                        const hasLocked = tourHasLocked(t);
                        return (
                          <div key={t.key} className="rounded-lg border bg-card">
                            <div className="flex items-start gap-3 border-b p-3">
                              {t.coverImage ? (
                                <img src={t.coverImage} alt="" className="size-12 shrink-0 rounded-md object-cover" />
                              ) : (
                                <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted">
                                  <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-semibold">{t.tourName || t.displayName}</div>
                                <div className="text-xs text-muted-foreground">
                                  {t.discounts.length} slot{t.discounts.length === 1 ? "" : "s"}
                                  {tour && tour.status !== "active" && ` · tour is ${tour.status}`}
                                  {!tour && " · tour not found"}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={ti === 0} onClick={() => moveTour(ti, -1)} aria-label={`Move ${t.displayName} up`}>
                                  <ArrowUp aria-hidden />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={ti === draftTours.length - 1}
                                  onClick={() => moveTour(ti, 1)}
                                  aria-label={`Move ${t.displayName} down`}
                                >
                                  <ArrowDown aria-hidden />
                                </Button>
                                <LockTip show={hasLocked} text="Has held/sold slots, so it can't be removed">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    disabled={hasLocked}
                                    onClick={() => setDraftTours((prev) => prev.filter((x) => x.key !== t.key))}
                                    aria-label={`Remove ${t.displayName} from sale`}
                                  >
                                    <Trash2 aria-hidden />
                                  </Button>
                                </LockTip>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 p-3 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
                              <div className="flex flex-col gap-3">
                                <div className="flex flex-col gap-1.5">
                                  <Label htmlFor={`${t.key}-display`}>Card title</Label>
                                  <Input
                                    id={`${t.key}-display`}
                                    value={t.displayName}
                                    maxLength={80}
                                    onChange={(e) => patchTour(t.key, { displayName: e.target.value })}
                                  />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <Label htmlFor={`${t.key}-price`}>Original price (£)</Label>
                                  <Input
                                    id={`${t.key}-price`}
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    step="1"
                                    value={t.originalPrice}
                                    onChange={(e) => patchTour(t.key, { originalPrice: e.target.value })}
                                    aria-describedby={priceDiffers ? `${t.key}-price-warn` : undefined}
                                  />
                                  {priceDiffers && (
                                    <p id={`${t.key}-price-warn`} className="flex flex-wrap items-center gap-1 text-xs text-amber-700">
                                      <AlertTriangle className="h-3 w-3" aria-hidden />
                                      Tour page price is {formatGBP(tourPrice)}.
                                      <Button
                                        type="button"
                                        variant="link"
                                        size="sm"
                                        className="h-auto p-0 text-xs"
                                        onClick={() => patchTour(t.key, { originalPrice: String(tourPrice) })}
                                      >
                                        Use {formatGBP(tourPrice)}
                                      </Button>
                                    </p>
                                  )}
                                </div>
                                {t.notes.length > 0 && (
                                  <ul className="flex flex-col gap-1 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                                    {t.notes.map((n, i) => (
                                      <li key={i} className="flex gap-1">
                                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                                        {n}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              <div className="min-w-0">
                                <table className="w-full text-sm">
                                  <caption className="sr-only">Slots for {t.displayName}</caption>
                                  <thead>
                                    <tr className="text-left text-xs text-muted-foreground">
                                      <th scope="col" className="w-10 pb-1 font-medium">#</th>
                                      <th scope="col" className="pb-1 font-medium">Discount £</th>
                                      <th scope="col" className="pb-1 font-medium">Sale price</th>
                                      <th scope="col" className="pb-1 font-medium">Status</th>
                                      <th scope="col" className="pb-1 text-right font-medium">
                                        <span className="sr-only">Actions</span>
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {t.discounts.map((d, pos) => {
                                      const inv = invSlot(t.tourPackageId, pos);
                                      const isLocked = locked(t.tourPackageId, pos);
                                      const disc = numOrNaN(d.value);
                                      const price = isLocked && inv ? inv.salePrice : Number.isFinite(original) && Number.isFinite(disc) ? salePriceFor(original, disc) : null;
                                      const st = inv ? slotDisplayStatus(inv, now) : null;
                                      const inputId = `${t.key}-slot-${pos}`;
                                      return (
                                        <tr key={d.key} className="border-t">
                                          <td className="py-1.5 font-medium">{pos + 1}</td>
                                          <td className="py-1.5 pr-2">
                                            <LockTip show={isLocked} text="Held/sold slots keep their price">
                                              <div className="relative max-w-[9rem]">
                                                <Input
                                                  id={inputId}
                                                  type="number"
                                                  inputMode="decimal"
                                                  min={0}
                                                  step="1"
                                                  value={d.value}
                                                  disabled={isLocked}
                                                  onChange={(e) => setDiscount(t, pos, e.target.value)}
                                                  aria-label={`Slot ${pos + 1} discount in pounds`}
                                                  className={cn("h-9", isLocked && "pr-8")}
                                                />
                                                {isLocked && <Lock className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />}
                                              </div>
                                            </LockTip>
                                          </td>
                                          <td className="py-1.5 pr-2 tabular-nums">
                                            {price === null ? (
                                              <span className="text-muted-foreground">—</span>
                                            ) : (
                                              <span className={cn(Number.isFinite(disc) && Number.isFinite(original) && disc > original && "text-amber-700")}>
                                                {formatGBP(price)}
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-1.5 pr-2">
                                            {st ? (
                                              <Badge variant="outline" className={SLOT_STATUS_META[st].className}>
                                                {SLOT_STATUS_META[st].label}
                                              </Badge>
                                            ) : (
                                              <span className="text-xs text-muted-foreground">New</span>
                                            )}
                                          </td>
                                          <td className="py-1.5">
                                            <div className="flex justify-end gap-0.5">
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                disabled={pos === 0 || isLocked || locked(t.tourPackageId, pos - 1)}
                                                onClick={() => moveSlot(t, pos, -1)}
                                                aria-label={`Move slot ${pos + 1} up`}
                                              >
                                                <ArrowUp aria-hidden />
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8"
                                                disabled={pos === t.discounts.length - 1 || isLocked || locked(t.tourPackageId, pos + 1)}
                                                onClick={() => moveSlot(t, pos, 1)}
                                                aria-label={`Move slot ${pos + 1} down`}
                                              >
                                                <ArrowDown aria-hidden />
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-destructive hover:text-destructive"
                                                disabled={!canRemoveSlot(t, pos)}
                                                onClick={() => removeSlot(t, pos)}
                                                aria-label={`Remove slot ${pos + 1}`}
                                              >
                                                <X aria-hidden />
                                              </Button>
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                  <Button type="button" variant="outline" size="sm" disabled={t.discounts.length >= MAX_SLOTS} onClick={() => addSlot(t)}>
                                    <Plus aria-hidden /> Add slot
                                  </Button>
                                  {notDescending && (
                                    <p className="flex items-center gap-1 text-xs text-amber-700">
                                      <AlertTriangle className="h-3 w-3" aria-hidden />
                                      A later slot has a bigger discount than an earlier one.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Right sidebar: section nav + actions */}
            <nav aria-label="Editor sections" className="flex w-48 shrink-0 flex-col overflow-hidden border-l border-border bg-muted/30">
              <div className="flex-1 overflow-y-auto p-4">
                <div className="flex flex-col gap-1">
                  {SECTIONS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => scrollToSection(s.id)}
                      aria-current={activeSection === s.id ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        activeSection === s.id ? "bg-crimson-red text-white" : "text-foreground hover:bg-muted",
                      )}
                    >
                      <s.icon className="h-4 w-4" aria-hidden />
                      {s.title}
                      {s.id === "tours" && draftTours.length > 0 && (
                        <span className="ml-auto text-xs opacity-80">{draftTours.length}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t border-border p-4">
                <Button variant="outline" onClick={requestClose} className="w-full" size="sm" disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={busy} className="w-full" size="sm">
                  {saving && <Loader2 className="animate-spin" aria-hidden />}
                  {saving ? "Saving…" : isEdit ? "Save sale" : "Create sale"}
                </Button>
                {(uploading.desktop || uploading.mobile) && (
                  <p className="text-center text-xs text-muted-foreground" role="status">
                    Uploading banner…
                  </p>
                )}
              </div>
            </nav>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>Your unsaved changes to this sale will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={onClose} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function SectionHeader({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <CardHeader className="overflow-hidden rounded-t-lg border-b border-border bg-gray-300 py-2 pb-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
            <div className="rounded-full rounded-br-none bg-crimson-red/10 p-1">
              <Icon className="h-3 w-3 text-crimson-red" />
            </div>
            {title}
          </CardTitle>
          <CardDescription className="text-muted-foreground">{description}</CardDescription>
        </div>
        {children}
      </div>
    </CardHeader>
  );
}

/** Wraps a (possibly disabled) control with a tooltip; disabled controls can't take hover/focus themselves. */
function LockTip({ show, text, children }: { show: boolean; text: string; children: React.ReactNode }) {
  if (!show) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={text}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

function BannerField({
  id,
  label,
  hint,
  url,
  uploading,
  onUrl,
  onFile,
  aspect,
}: {
  id: string;
  label: string;
  hint: string;
  url: string;
  uploading: boolean;
  onUrl: (url: string) => void;
  onFile: (file: File | undefined) => void;
  aspect: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const inputId = `sale-banner-${id}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={`${inputId}-url`}>{label}</Label>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className={cn("relative w-full overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/30", aspect)}>
        {url ? (
          <>
            <img src={url} alt={`${label} preview`} className="h-full w-full object-cover" />
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="absolute right-2 top-2 h-8 w-8 rounded-full"
              onClick={() => onUrl("")}
              aria-label={`Remove ${label.toLowerCase()}`}
            >
              <X aria-hidden />
            </Button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground transition-colors hover:border-crimson-red hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {uploading ? <Loader2 className="h-8 w-8 animate-spin" aria-hidden /> : <Upload className="h-8 w-8" aria-hidden />}
            <span className="text-sm font-medium">{uploading ? "Uploading…" : `Upload ${label.toLowerCase()}`}</span>
          </button>
        )}
        {uploading && url && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70" role="status">
            <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
            <span className="sr-only">Uploading</span>
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="flex gap-2">
        <Input
          id={`${inputId}-url`}
          type="url"
          placeholder="or paste an image URL"
          value={url}
          onChange={(e) => onUrl(e.target.value)}
          className="h-9"
        />
        {url && (
          <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Upload aria-hidden /> Replace
          </Button>
        )}
      </div>
    </div>
  );
}
