import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Link2, ArrowRight } from "lucide-react";
import { generateSlug } from "@/utils";

interface SlugChangeModalProps {
  open: boolean;
  /** The tour's current (now-outdated) slug. */
  oldSlug: string;
  /** Slug derived from the new tour name; pre-fills the editable field. */
  proposedSlug: string;
  /** Keep the current URL — leaves the slug unchanged. */
  onCancel: () => void;
  /** Apply the new slug and log the old one (redirecting unless toggled off). */
  onConfirm: (finalSlug: string, redirectOld: boolean) => void;
}

/**
 * Shown when the admin renames a tour and the new name produces a different URL
 * slug. Confirms the URL change, lets the admin override the proposed slug, and
 * records the old slug as a redirect so existing links keep working.
 */
export default function SlugChangeModal({
  open,
  oldSlug,
  proposedSlug,
  onCancel,
  onConfirm,
}: SlugChangeModalProps) {
  const [slug, setSlug] = useState(proposedSlug);
  const [redirectOld, setRedirectOld] = useState(true);

  // Re-seed when a fresh rename opens the modal.
  useEffect(() => {
    if (open) {
      setSlug(proposedSlug);
      setRedirectOld(true);
    }
  }, [open, proposedSlug]);

  const finalSlug = generateSlug(slug) || proposedSlug;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-crimson-red" />
            <DialogTitle className="text-lg font-semibold">
              Update the tour URL?
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-muted-foreground">
            You renamed this tour, so its URL slug is now out of date. Update it to
            match the new name, or keep the current URL.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Old → new at a glance */}
          <div className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate rounded-md bg-light-grey px-2.5 py-1.5 font-mono text-dark-gray line-through">
              /{oldSlug || "—"}
            </span>
            <ArrowRight className="size-4 shrink-0 text-dark-gray/60" />
            <span className="min-w-0 flex-1 truncate rounded-md bg-crimson-red/5 px-2.5 py-1.5 font-mono text-midnight">
              /{finalSlug}
            </span>
          </div>

          {/* Editable new slug */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-midnight">
              New URL slug
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={proposedSlug}
              className="w-full rounded-md border border-border px-3 py-1.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-crimson-red/40"
            />
            <p className="mt-1 truncate text-[11px] text-dark-gray/70">
              imheretravels.com/all-tours/{finalSlug}
            </p>
          </div>

          {/* Redirect toggle */}
          {oldSlug && (
            <div className="flex items-center justify-between rounded-lg border border-light-grey px-3 py-2">
              <div className="min-w-0 pr-3">
                <span className="block text-sm text-midnight">
                  Redirect the old URL
                </span>
                <span className="block text-xs text-dark-gray">
                  Send <span className="font-mono">/tours/{oldSlug}</span> to the new
                  URL so existing links keep working.
                </span>
              </div>
              <Switch
                checked={redirectOld}
                onCheckedChange={setRedirectOld}
                className="shrink-0 data-[state=checked]:bg-crimson-red"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            Keep current URL
          </Button>
          <Button
            onClick={() => onConfirm(finalSlug, redirectOld)}
            disabled={!finalSlug}
            className="gap-2"
          >
            <Link2 className="h-4 w-4" />
            Update URL
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
