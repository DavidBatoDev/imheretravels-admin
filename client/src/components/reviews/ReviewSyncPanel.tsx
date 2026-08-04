"use client";

import { useEffect, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Visibility + manual trigger for the two federated review syncs (Google
 * Business Profile, TourRadar). Both run on their own schedule/cron (Google
 * every 6h; TourRadar is manual-only — see scheduled-sync-tourradar-reviews.ts
 * for why) but the admin dashboard previously had no way to see when either
 * last ran or to kick one off on demand — this reads their `config/*-sync`
 * doc + latest `*-reviews-logs` entry and calls the matching "Sync now"
 * callable (`syncGoogleReviewsNow` / `syncTourRadarReviewsNow`).
 */

interface SyncConfig {
  enabled: boolean;
  dryRun: boolean;
}

interface SyncLog {
  at?: number;
  trigger?: string;
  created?: number;
  updated?: number;
  errors?: number;
  ok?: boolean;
  skippedReason?: string;
}

function toMillis(v: unknown): number | undefined {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  return typeof v === "number" ? v : undefined;
}

function relativeTime(ms?: number): string {
  if (!ms) return "never";
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

/** Subscribes to one sync's config doc + latest log entry. */
function useSyncStatus(configPath: string, logsCollection: string, timeField: string) {
  const [config, setConfig] = useState<SyncConfig | null>(null);
  const [lastLog, setLastLog] = useState<SyncLog | null>(null);

  useEffect(() => {
    const unsubConfig = onSnapshot(
      doc(db, configPath),
      (snap) => {
        const d = snap.data();
        setConfig({ enabled: d?.enabled !== false, dryRun: d?.dryRun === true });
      },
      () => setConfig(null),
    );
    const logsQuery = query(collection(db, logsCollection), orderBy(timeField, "desc"), limit(1));
    const unsubLog = onSnapshot(
      logsQuery,
      (snap) => {
        const d = snap.docs[0]?.data();
        if (!d) {
          setLastLog(null);
          return;
        }
        setLastLog({
          at: toMillis(d[timeField]),
          trigger: d.trigger,
          created: d.created,
          updated: d.updated,
          errors: d.errors,
          ok: d.ok,
          skippedReason: d.skippedReason,
        });
      },
      () => setLastLog(null),
    );
    return () => {
      unsubConfig();
      unsubLog();
    };
  }, [configPath, logsCollection, timeField]);

  return { config, lastLog };
}

export default function ReviewSyncPanel() {
  const { toast } = useToast();
  const google = useSyncStatus("config/google-reviews-sync", "google-reviews-logs", "ranAt");
  const tourRadar = useSyncStatus("config/tourradar-reviews-sync", "tourradar-reviews-logs", "finishedAt");
  const [syncing, setSyncing] = useState<"google" | "tourradar" | null>(null);

  async function runSync(which: "google" | "tourradar") {
    setSyncing(which);
    const label = which === "google" ? "Google" : "TourRadar";
    try {
      const fn = httpsCallable(
        functions,
        which === "google" ? "syncGoogleReviewsNow" : "syncTourRadarReviewsNow",
      );
      const result = await fn();
      // Google's callable returns `skippedReason` (a string); TourRadar's
      // reuses the field name `skipped` for the same purpose but it's a
      // *number* on Google's shape (skipped review count) — only treat it as
      // a message when it's actually a string, so the two never collide.
      const data = result.data as { skippedReason?: string; skipped?: string | number };
      const skippedReason = data.skippedReason ?? (typeof data.skipped === "string" ? data.skipped : undefined);
      if (skippedReason) {
        toast({ title: `${label} sync skipped`, description: skippedReason });
      } else {
        toast({ title: `${label} reviews synced` });
      }
    } catch (e) {
      toast({
        title: `${label} sync failed`,
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SyncCard
        label="Google reviews"
        status={google}
        syncing={syncing === "google"}
        onSync={() => runSync("google")}
      />
      <SyncCard
        label="TourRadar reviews"
        status={tourRadar}
        syncing={syncing === "tourradar"}
        onSync={() => runSync("tourradar")}
      />
    </div>
  );
}

function SyncCard({
  label,
  status,
  syncing,
  onSync,
}: {
  label: string;
  status: { config: SyncConfig | null; lastLog: SyncLog | null };
  syncing: boolean;
  onSync: () => void;
}) {
  const { config, lastLog } = status;
  const summary = lastLog
    ? lastLog.skippedReason
      ? `Last run skipped — ${lastLog.skippedReason}`
      : `Last synced ${relativeTime(lastLog.at)} — ${lastLog.created ?? 0} created, ${lastLog.updated ?? 0} updated` +
        (lastLog.errors ? `, ${lastLog.errors} error${lastLog.errors === 1 ? "" : "s"}` : "")
    : "Never synced";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-sm">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{label}</span>
          {config && !config.enabled && (
            <Badge variant="secondary" className="text-[10px]">
              Disabled
            </Badge>
          )}
          {config?.dryRun && (
            <Badge variant="outline" className="text-[10px]">
              Dry run
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{summary}</p>
      </div>
      <Button size="sm" variant="outline" onClick={onSync} disabled={syncing} className="shrink-0">
        {syncing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        <span className="ml-1.5">Sync now</span>
      </Button>
    </div>
  );
}
