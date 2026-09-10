"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X, Loader2, UserPlus, Check } from "lucide-react";
import {
  getAllResidentHosts,
  updateResidentHost,
} from "@/services/resident-hosts-service";
import type { ResidentHost } from "@/types/resident-hosts";
import { useToast } from "@/hooks/use-toast";

interface AttachedHostPickerProps {
  /** tourPackages doc ID. Absent while the tour is still unsaved. */
  tourId?: string;
}

/**
 * Attach an (optional) resident host to this hosted tour.
 *
 * The relation lives on the host side — `residentHost.attachedTourIds` — so
 * this writes straight through `updateResidentHost` instead of the tour form.
 * A tour belongs to at most one host here: attaching detaches it from whoever
 * held it before, which keeps the www resident-host pages unambiguous.
 */
export default function AttachedHostPicker({ tourId }: AttachedHostPickerProps) {
  const { toast } = useToast();
  const [hosts, setHosts] = useState<ResidentHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getAllResidentHosts()
      .then((data) => active && setHosts(data))
      .catch(() => active && setHosts([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const attachedHost = useMemo(
    () =>
      tourId
        ? hosts.find((h) => (h.attachedTourIds ?? []).includes(tourId))
        : undefined,
    [hosts, tourId],
  );

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return hosts
      .filter((h) => h.id !== attachedHost?.id)
      .filter((h) =>
        term
          ? h.displayName?.toLowerCase().includes(term) ||
            h.slug?.toLowerCase().includes(term)
          : true,
      )
      .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
  }, [hosts, attachedHost, search]);

  // Optimistically move the tour between hosts locally, then persist both
  // sides; on failure the list is refetched so the UI can't drift.
  async function apply(nextHostId: string | null) {
    if (!tourId || saving) return;
    const previous = attachedHost;
    setSaving(true);
    try {
      if (previous && previous.id !== nextHostId) {
        await updateResidentHost(previous.id, {
          attachedTourIds: (previous.attachedTourIds ?? []).filter(
            (id) => id !== tourId,
          ),
        } as any);
      }
      const next = nextHostId ? hosts.find((h) => h.id === nextHostId) : null;
      if (next && !(next.attachedTourIds ?? []).includes(tourId)) {
        await updateResidentHost(next.id, {
          attachedTourIds: [...(next.attachedTourIds ?? []), tourId],
        } as any);
      }
      setHosts((cur) =>
        cur.map((h) => {
          const ids = (h.attachedTourIds ?? []).filter((id) => id !== tourId);
          return {
            ...h,
            attachedTourIds: h.id === nextHostId ? [...ids, tourId] : ids,
          };
        }),
      );
      setOpen(false);
      setSearch("");
      toast({
        title: nextHostId ? "Host attached" : "Host detached",
        description: nextHostId
          ? `This tour now shows under ${next?.displayName}.`
          : `Removed from ${previous?.displayName}.`,
      });
    } catch (error) {
      console.error("Error updating resident host attachment:", error);
      getAllResidentHosts().then(setHosts).catch(() => {});
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to update host.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!tourId) {
    return (
      <p className="mt-2 text-[11px] text-dark-gray">
        Save the tour first to attach a resident host.
      </p>
    );
  }

  return (
    <div className="mt-2">
      {attachedHost ? (
        <div className="flex items-center gap-2 rounded-lg border border-light-grey px-3 py-2">
          <div className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-body text-midnight">
              {attachedHost.displayName}
            </span>
            <span className="block truncate text-xs text-dark-gray">
              /resident-hosts/{attachedHost.slug}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-md px-2 py-1 text-xs font-body text-crimson-red hover:bg-crimson-red/10"
          >
            Change
          </button>
          <button
            type="button"
            onClick={() => apply(null)}
            disabled={saving}
            title="Detach host"
            className="grid size-7 shrink-0 place-items-center rounded-lg text-dark-gray transition-colors hover:bg-crimson-red/10 hover:text-crimson-red"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-light-grey px-3 py-1.5 text-xs font-body text-midnight transition-colors hover:bg-light-grey"
        >
          <UserPlus className="size-3.5 text-crimson-red" />
          Attach Resident Host
        </button>
      )}

      {open && (
        <div className="mt-2 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dark-gray/50" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search resident hosts…"
              className="w-full rounded-md border border-border py-1.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-crimson-red/40"
            />
          </div>

          {loading || saving ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="size-4 animate-spin text-dark-gray/50" />
            </div>
          ) : matches.length > 0 ? (
            <div className="max-h-52 space-y-1 overflow-y-auto scrollbar-hide rounded-xl border border-light-grey p-1">
              {matches.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => apply(h.id)}
                  className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-light-grey"
                >
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-sm font-medium text-midnight">
                      {h.displayName}
                    </p>
                    <p className="truncate text-xs text-dark-gray">
                      /{h.slug}
                      {h.status !== "active" ? ` · ${h.status}` : ""}
                    </p>
                  </div>
                  <Check className="size-3.5 shrink-0 text-spring-green opacity-0" />
                </button>
              ))}
            </div>
          ) : (
            <p className="px-1 py-2 text-center text-xs text-dark-gray/60">
              {search ? "No matching resident hosts." : "No resident hosts yet."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
