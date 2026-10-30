"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import ConfirmLeaveModal from "@/components/shared/ConfirmLeaveModal";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { SaleEventsService, describeSaleError, type SaleWithInventory } from "@/services/sale-events-service";
import type { TourPackage } from "@/types/tours";
import { uploadSaleBanner } from "@/utils/file-upload";
import SaleSlotTracker from "../SaleSlotTracker";
import {
  SALE_STATUS_META,
  heroStatusLabel,
  localInputToIso,
  matchCsvTour,
  numOrNaN,
  parseSaleCsv,
  publicSaleUrl,
  salePhase,
  salePreviewUrl,
  slugify,
  useNow,
  type SalePhase,
} from "../sale-utils";
import { EditTag, InlineInput } from "./fields";
import SaleDealsEditor from "./SaleDealsEditor";
import SaleEditorToolbar, { type ScheduleValue } from "./SaleEditorToolbar";
import SaleFixedContent from "./SaleFixedContent";
import SaleHeroEditor, { type BannerKind, type PreviewMode } from "./SaleHeroEditor";
import SaleSettingsPanel from "./SaleSettingsPanel";
import SaleTourDrawer from "./SaleTourDrawer";
import {
  applyCsvGroup,
  draftFromSale,
  draftFromTour,
  draftSnapshot,
  isLockedAt,
  maxDiscount,
  newKey,
  newSaleDraft,
  previewSlots,
  toSaleInput,
  tourHasLocked,
  type DraftTour,
  type SaleDraft,
  type UnmatchedGroup,
} from "./sale-draft";

export const SALES_LIST_URL = "/tours?tab=discounted";

const PHASE_BADGE: Record<SalePhase, { label: string; className: string }> = {
  live: { label: "Live now", className: SALE_STATUS_META.live.className },
  upcoming: { label: "Live · not started", className: "border-sky-200 bg-sky-50 text-sky-900" },
  paused: { label: "Paused", className: SALE_STATUS_META.paused.className },
  ended: { label: "Ended", className: SALE_STATUS_META.ended.className },
};

interface SaleEditorProps {
  /** null = new sale. */
  sale: SaleWithInventory | null;
  tours: TourPackage[];
  allSales: SaleWithInventory[];
}

/** Full-page WYSIWYG editor for a sale page, modelled on the tour editor. */
export default function SaleEditor({ sale: initialSale, tours, allSales }: SaleEditorProps) {
  const router = useRouter();
  const { toast } = useToast();
  const now = useNow(15_000);

  const [sale, setSale] = useState<SaleWithInventory | null>(initialSale);
  const [draft, setDraft] = useState<SaleDraft>(() => (initialSale ? draftFromSale(initialSale) : newSaleDraft(allSales.length === 0)));
  const [baseline, setBaseline] = useState(() => draftSnapshot(draft));
  const [unmatched, setUnmatched] = useState<UnmatchedGroup[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<Record<BannerKind, boolean>>({ desktop: false, mobile: false, og: false });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [heroMode, setHeroMode] = useState<PreviewMode>("desktop");

  const dirty = draftSnapshot(draft) !== baseline || unmatched.length > 0;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const goBack = useCallback(() => router.push(SALES_LIST_URL), [router]);
  const leaveGuard = useUnsavedChangesGuard({ isDirty: () => dirtyRef.current, onLeave: goBack });

  const inventory = sale?.inventory;
  const tourById = useMemo(() => new Map(tours.map((t) => [t.id, t])), [tours]);
  // Draft tours can be sold too (no public tour page); archived ones can't.
  const pickableTours = useMemo(
    () =>
      tours
        .filter((t) => t.status === "active" || t.status === "draft")
        .sort((a, b) => Number(a.status !== "active") - Number(b.status !== "active") || (a.name ?? "").localeCompare(b.name ?? "")),
    [tours],
  );
  const otherSlugs = useMemo(() => allSales.filter((s) => s.id !== sale?.id).map((s) => s.slug), [allSales, sale?.id]);

  const patch = useCallback((p: Partial<SaleDraft>) => setDraft((d) => ({ ...d, ...p })), []);
  const patchTour = useCallback(
    (key: string, p: Partial<DraftTour>) => setDraft((d) => ({ ...d, tours: d.tours.map((t) => (t.key === key ? { ...t, ...p } : t)) })),
    [],
  );
  const locked = useCallback((tourPackageId: string, pos: number) => isLockedAt(inventory, tourPackageId, pos, Date.now()), [inventory]);

  // ---- Derived page state -------------------------------------------------

  const startIso = localInputToIso(draft.startLocal);
  const endIso = draft.endTba ? null : localInputToIso(draft.endLocal);
  const phase = salePhase({ status: draft.status, startAt: startIso, endAt: endIso }, now);
  const statusText = heroStatusLabel({ startAt: startIso, endAt: endIso }, phase);
  const firstTour = draft.tours[0];
  const siteBadge = sale
    ? sale.status === "draft"
      ? { label: "Draft · not public", className: SALE_STATUS_META.draft.className }
      : PHASE_BADGE[salePhase(sale, now)]
    : { label: "Not saved yet", className: SALE_STATUS_META.draft.className };
  const previewLink = sale?.previewToken ? salePreviewUrl(sale.previewToken) : null;
  const liveUrl = sale && sale.status === "live" ? publicSaleUrl(sale.slug) : null;
  const editingIndex = draft.tours.findIndex((t) => t.key === editingKey);
  const editingTour = editingIndex >= 0 ? draft.tours[editingIndex] : null;
  const busy = saving || uploading.desktop || uploading.mobile || uploading.og;

  // ---- Actions --------------------------------------------------------------

  function onNameChange(name: string) {
    setDraft((d) => ({ ...d, name, ...(d.slugTouched ? {} : { slug: slugify(name) }) }));
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${what} copied` });
    } catch {
      toast({ title: "Couldn't copy", description: text, variant: "destructive" });
    }
  }

  async function upload(kind: BannerKind, file: File) {
    setUploading((u) => ({ ...u, [kind]: true }));
    try {
      const res = await uploadSaleBanner(file);
      if (!res.success || !res.data?.publicUrl) throw new Error(res.error || "Upload failed");
      const url = res.data.publicUrl;
      patch(kind === "desktop" ? { bannerUrl: url } : kind === "mobile" ? { mobileBannerUrl: url } : { ogImage: url });
      toast({ title: `${kind === "og" ? "Share image" : kind === "desktop" ? "Desktop banner" : "Mobile banner"} uploaded`, description: "Save to publish it." });
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setUploading((u) => ({ ...u, [kind]: false }));
    }
  }

  function addTour(t: TourPackage) {
    setDraft((d) => (d.tours.some((x) => x.tourPackageId === t.id) ? d : { ...d, tours: [...d.tours, draftFromTour(t)] }));
  }

  function removeTour(key: string) {
    const t = draft.tours.find((x) => x.key === key);
    if (!t || tourHasLocked(inventory, t.tourPackageId, Date.now())) return;
    setDraft((d) => ({ ...d, tours: d.tours.filter((x) => x.key !== key) }));
    if (editingKey === key) setEditingKey(null);
    toast({ title: `${t.displayName || t.tourName} removed`, description: "Save to apply. Leave without saving to undo." });
  }

  function reorder(from: number, to: number) {
    setDraft((d) => {
      if (to < 0 || to >= d.tours.length) return d;
      const next = [...d.tours];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return { ...d, tours: next };
    });
  }

  async function onCsvFile(file: File) {
    const { groups, errors } = parseSaleCsv(await file.text());
    if (!groups.length) {
      toast({ title: "Nothing imported", description: errors.join("\n") || "The CSV has no tour rows.", variant: "destructive" });
      return;
    }
    let next = draft.tours;
    const pending: UnmatchedGroup[] = [];
    const claimed = new Map<string, string>();
    let matched = 0;
    for (const g of groups) {
      const m = matchCsvTour(g.label, pickableTours);
      if (m.tour && claimed.has(m.tour.id)) {
        pending.push({ key: newKey(), group: g, candidates: [m.tour], reason: `Also matched by "${claimed.get(m.tour.id)}"` });
      } else if (m.tour) {
        claimed.set(m.tour.id, g.label);
        next = applyCsvGroup(next, g, m.tour, locked);
        matched++;
      } else {
        pending.push({ key: newKey(), group: g, candidates: m.candidates, reason: m.reason });
      }
    }
    setDraft((d) => ({ ...d, tours: next }));
    setUnmatched((u) => [...u, ...pending]);
    toast({
      title: `Imported ${matched} tour${matched === 1 ? "" : "s"}${pending.length ? ` · ${pending.length} need a manual pick` : ""}`,
      description: errors.length ? errors.slice(0, 4).join("\n") : "Check the cards below, then save.",
      variant: errors.length ? "destructive" : undefined,
    });
    document.getElementById("sale-deals")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resolveUnmatched(u: UnmatchedGroup, tour: TourPackage) {
    setDraft((d) => ({ ...d, tours: applyCsvGroup(d.tours, u.group, tour, locked) }));
    setUnmatched((list) => list.filter((x) => x.key !== u.key));
  }

  async function refreshInventory() {
    if (!sale) return;
    try {
      setSale(await SaleEventsService.get(sale.id));
    } catch {
      // The tracker shows its own errors; the editor keeps its last copy.
    }
  }

  async function save() {
    if (busy) return;
    const { input, errors } = toSaleInput(draft, { unmatched: unmatched.length, otherSlugs });
    if (!input) {
      toast({
        title: errors.length === 1 ? "Fix 1 problem before saving" : `Fix ${errors.length} problems before saving`,
        description: errors.slice(0, 4).map((e) => e.message).join("\n"),
        variant: "destructive",
      });
      const area = errors[0].area;
      if (area === "settings" || area === "seo") setSettingsOpen(true);
      else if (area === "schedule") setScheduleOpen(true);
      else if (area === "tours") document.getElementById("sale-deals")?.scrollIntoView({ behavior: "smooth", block: "start" });
      else document.getElementById("sale-name")?.focus();
      return;
    }
    setSaving(true);
    try {
      if (!sale) {
        const id = await SaleEventsService.create(input);
        setBaseline(draftSnapshot(draft)); // nothing unsaved: the route change mustn't prompt
        dirtyRef.current = false;
        toast({ title: "Sale created", description: "Your private preview link is ready in the toolbar." });
        router.replace(`/tours/sales/${encodeURIComponent(id)}/edit`);
        return;
      }
      await SaleEventsService.update(sale.id, input);
      try {
        const fresh = await SaleEventsService.get(sale.id);
        const next = draftFromSale(fresh);
        setSale(fresh);
        setDraft(next);
        setBaseline(draftSnapshot(next));
        setEditingKey(null);
      } catch {
        setBaseline(draftSnapshot(draft));
      }
      toast({ title: "Changes saved", description: `${input.name} · /${input.slug}` });
    } catch (e) {
      const { title, description } = describeSaleError(
        e,
        (id) => tourById.get(id)?.name ?? draft.tours.find((t) => t.tourPackageId === id)?.tourName ?? id,
      );
      toast({ title, description, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // Ctrl/Cmd+S saves.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- Render ---------------------------------------------------------------

  const firstSlots = firstTour ? previewSlots(inventory, firstTour, now) : [];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-light-grey">
        <SaleEditorToolbar
          name={draft.name}
          siteBadge={siteBadge}
          status={draft.status}
          onStatus={(status) => patch({ status })}
          schedule={{ startLocal: draft.startLocal, endTba: draft.endTba, endLocal: draft.endLocal }}
          onSchedule={(p: Partial<ScheduleValue>) => patch(p)}
          scheduleOpen={scheduleOpen}
          onScheduleOpen={setScheduleOpen}
          settingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen((o) => !o)}
          canTrack={!!sale}
          onTrack={() => setTrackerOpen(true)}
          previewLink={previewLink}
          liveUrl={liveUrl}
          onCopy={copy}
          dirty={dirty}
          saving={saving}
          busy={busy}
          isNew={!sale}
          onSave={save}
          onBack={() => leaveGuard.requestNav(goBack)}
        />

        <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-8">
          <div>
            <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 font-body text-b4-desktop text-dark-gray">
              <span>Tours</span>
              <span aria-hidden>/</span>
              <span>Sales &amp; Discounts</span>
              <span aria-hidden>/</span>
              <span className="max-w-xs truncate font-bold text-midnight">{draft.name || "New sale"}</span>
            </nav>
            <EditTag>
              <label htmlFor="sale-name">Sale name (internal)</label>
            </EditTag>
            <InlineInput
              id="sale-name"
              value={draft.name}
              maxLength={120}
              placeholder="Sale name, e.g. Black Friday"
              onChange={(e) => onNameChange(e.target.value)}
              aria-invalid={!draft.name.trim()}
              className="font-display text-h4-mobile font-bold text-midnight md:text-h3-desktop"
            />
          </div>

          <SaleHeroEditor
            title={draft.heroTitle}
            subtitle={draft.heroSubtitle}
            bannerUrl={draft.bannerUrl}
            mobileBannerUrl={draft.mobileBannerUrl}
            onChange={patch}
            statusText={statusText}
            phase={phase}
            isDraft={draft.status === "draft"}
            startAt={startIso}
            upTo={maxDiscount(draft)}
            hasTours={draft.tours.length > 0}
            fallbackImage={firstTour?.coverImage}
            mode={heroMode}
            onModeChange={setHeroMode}
            uploading={uploading}
            onUpload={upload}
          />

          <SaleFixedContent
            part="how"
            holdMinutes={Number.isFinite(numOrNaN(draft.holdMinutes)) ? Number(draft.holdMinutes) : 15}
            example={firstTour ? { name: firstTour.displayName, originalPrice: numOrNaN(firstTour.originalPrice) || 0, slots: firstSlots } : undefined}
          />

          <SaleDealsEditor
            tours={draft.tours}
            tourById={tourById}
            pickableTours={pickableTours}
            inventory={inventory}
            now={now}
            unmatched={unmatched}
            hasLocked={(t) => tourHasLocked(inventory, t.tourPackageId, now)}
            onPatchTour={patchTour}
            onAddTour={addTour}
            onRemoveTour={removeTour}
            onReorder={reorder}
            onEditTour={setEditingKey}
            onCsvFile={onCsvFile}
            onResolveUnmatched={resolveUnmatched}
            onSkipUnmatched={(key) => setUnmatched((list) => list.filter((x) => x.key !== key))}
          />

          <SaleFixedContent part="faq" holdMinutes={Number.isFinite(numOrNaN(draft.holdMinutes)) ? Number(draft.holdMinutes) : 15} />
        </main>
      </div>

      <SaleSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        draft={draft}
        onChange={(p) => (p.name !== undefined ? onNameChange(p.name) : patch(p))}
        onSlugChange={(slug) => patch({ slug, slugTouched: true })}
        savedSlug={sale?.slug ?? null}
        otherSlugs={otherSlugs}
        previewToken={sale?.previewToken || null}
        ogUploading={uploading.og}
        onOgUpload={(f) => upload("og", f)}
        onCopy={copy}
      />

      <SaleTourDrawer
        tour={editingTour}
        tourPkg={editingTour ? tourById.get(editingTour.tourPackageId) : undefined}
        inventory={inventory}
        now={now}
        position={Math.max(0, editingIndex)}
        total={draft.tours.length}
        hasLocked={!!editingTour && tourHasLocked(inventory, editingTour.tourPackageId, now)}
        onPatch={(p) => editingTour && patchTour(editingTour.key, p)}
        onMove={(dir) => reorder(editingIndex, editingIndex + dir)}
        onRemove={() => editingTour && removeTour(editingTour.key)}
        onClose={() => setEditingKey(null)}
      />

      {trackerOpen && sale && (
        <SaleSlotTracker
          sale={sale}
          onClose={() => {
            setTrackerOpen(false);
            void refreshInventory();
          }}
          onChanged={refreshInventory}
        />
      )}

      <ConfirmLeaveModal open={leaveGuard.isPending} onClose={leaveGuard.cancel} onConfirm={leaveGuard.confirm} />
    </TooltipProvider>
  );
}
