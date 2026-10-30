import { useCallback, useEffect, useRef, useState } from "react";
import type { SaleHoldView } from "@/types/sale-events";

/**
 * Black Friday slot hold behind a `?hold=<holdId>.<token>` link from the www
 * sale page. The hold lives on the server; this hook only reads it, shows the
 * countdown and tells the server when the customer presses Pay.
 *
 * The param is also kept in sessionStorage because the form rewrites its URL
 * to `?paymentid=` once a payment doc exists.
 */

const STORAGE_KEY = "iht_sale_hold";

function readHoldParam(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("hold");
    if (fromUrl) {
      sessionStorage.setItem(STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function splitHoldParam(param: string | null) {
  if (!param) return null;
  const dot = param.indexOf(".");
  return dot > 0 ? { holdId: param.slice(0, dot), token: param.slice(dot + 1) } : null;
}

export type SaleHoldPhase = "none" | "loading" | "active" | "secured" | "expired" | "invalid";

export function useSaleHold() {
  const [holdParam, setHoldParam] = useState<string | null>(null);
  const [hold, setHold] = useState<SaleHoldView | null>(null);
  const [phase, setPhase] = useState<SaleHoldPhase>("none");
  const [now, setNow] = useState(() => Date.now());
  const offsetRef = useRef(0);

  const applyView = useCallback((view: SaleHoldView) => {
    // Server clock offset, so a wrong device clock can't skew the countdown.
    offsetRef.current = Date.parse(view.serverNow) - Date.now();
    setHold(view);
    setNow(Date.now() + offsetRef.current);
    if (view.status === "converted") setPhase("secured");
    else if (view.status === "active") setPhase("active");
    else setPhase("expired");
  }, []);

  useEffect(() => {
    const param = readHoldParam();
    const parts = splitHoldParam(param);
    if (!param || !parts) return;
    setHoldParam(param);
    setPhase("loading");
    fetch(`/api/public/sale/holds/${encodeURIComponent(parts.holdId)}`, {
      headers: { "X-Hold-Token": parts.token },
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "invalid" : "error");
        applyView((await res.json()).hold);
      })
      .catch(() => setPhase("invalid"));
  }, [applyView]);

  // Tick from timestamps, never by counting intervals: iOS Safari pauses
  // timers in background tabs, so the time left is recomputed on return.
  useEffect(() => {
    if (phase !== "active") return;
    const tick = () => setNow(Date.now() + offsetRef.current);
    const id = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [phase]);

  const msLeft = hold ? Date.parse(hold.displayExpiresAt) - now : 0;

  useEffect(() => {
    // A hold mid-payment is protected on the server; don't show it as ended.
    if (phase === "active" && hold && !hold.paying && msLeft <= 0) setPhase("expired");
  }, [phase, hold, msLeft]);

  /** Pressing Pay: locks the slots for payment. Returns false when the hold has ended. */
  const markPaying = useCallback(async (): Promise<boolean> => {
    const parts = splitHoldParam(holdParam);
    if (!parts) return true;
    try {
      const res = await fetch(`/api/public/sale/holds/${encodeURIComponent(parts.holdId)}/paying`, {
        method: "POST",
        headers: { "X-Hold-Token": parts.token },
      });
      if (res.ok) {
        applyView((await res.json()).hold);
        return true;
      }
      if (res.status === 410 || res.status === 404) {
        setPhase("expired");
        return false;
      }
      return true; // transient error: the server still re-checks the hold on payment
    } catch {
      return true;
    }
  }, [holdParam, applyView]);

  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const markSecured = useCallback(() => {
    setPhase("secured");
    clear();
  }, [clear]);

  /** "Change party": gives the slots back. */
  const release = useCallback(async () => {
    const parts = splitHoldParam(holdParam);
    if (parts) {
      await fetch(`/api/public/sale/holds/${encodeURIComponent(parts.holdId)}/release`, {
        method: "POST",
        headers: { "X-Hold-Token": parts.token },
      }).catch(() => {});
    }
    clear();
  }, [holdParam, clear]);

  return {
    holdParam,
    hold,
    phase,
    isSaleHold: phase !== "none",
    msLeft: Math.max(0, msLeft),
    markPaying,
    markSecured,
    release,
    clear,
  };
}

export type UseSaleHoldResult = ReturnType<typeof useSaleHold>;
