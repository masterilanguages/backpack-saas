"use client";

import { useEffect, useRef } from "react";
import { base44 as base44Client } from "@/api/base44Client";
// base44Client is a JS shim; cast to any for ergonomic entity access.
const base44: any = base44Client;

// ---------------------------------------------------------------------------
// Lightweight study-time tracking.
//
// Accumulates *active* seconds (tab visible + user not idle) and banks them to
// the `study_session` table as one row per continuous stint. The Progress page
// and the Dashboard "This week" stat sum `duration_minutes` from those rows.
//
// Semantics mirror the legacy GameHeader stopwatch so the two never disagree:
//   - only stints of ≥ 60s are saved (tiny blips are ignored);
//   - a stint of ≥ 30 continuous minutes is flagged `completed` (that's what the
//     Progress "Sessions Completed" metric counts) — so we bank on a *break*
//     (idle / tab hidden / unmount), never on a fixed wall-clock interval, which
//     would chop a long session into sub-30-min rows.
//
// A module-level lock keeps exactly one tracker persisting per browser tab, even
// if several components mount the hook (nested layouts) — and lets the legacy
// GameHeader stopwatch stand down while the global tracker is running.
// ---------------------------------------------------------------------------

let activeOwner: symbol | null = null;

/** True when a global study-time tracker is actively persisting sessions. */
export function isStudyTimeTracked(): boolean {
  return activeOwner !== null;
}

const IDLE_LIMIT_MS = 5 * 60 * 1000; // bank the stint after 5 min of no activity
const MIN_SAVE_SECONDS = 60; // ignore stints under a minute
const COMPLETED_MINUTES = 30; // a session "counts" at 30+ continuous minutes

export function useStudyTime({ enabled = true }: { enabled?: boolean } = {}): void {
  const secondsRef = useRef(0); // active seconds accrued since the last save
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return;

    // Claim the singleton lock. If another instance already owns it, stay passive
    // (no timers, no writes) so we never double-count.
    const owner = Symbol("study-time");
    if (activeOwner) return;
    activeOwner = owner;

    const bump = () => {
      lastActivityRef.current = Date.now();
    };
    const activityEvents = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    activityEvents.forEach((e) =>
      window.addEventListener(e, bump, { passive: true }),
    );

    // Bank whatever has accrued as one session row, then reset. Best-effort:
    // on failure we roll the seconds back so they aren't silently lost.
    const flush = async (reason: string) => {
      const seconds = secondsRef.current;
      if (seconds < MIN_SAVE_SECONDS) return;
      secondsRef.current = 0;
      try {
        await base44.entities.StudySession.create({
          date: new Date().toISOString().split("T")[0],
          duration_minutes: Math.round(seconds / 60), // integer column
          stopped_reason: reason,
          completed: seconds / 60 >= COMPLETED_MINUTES,
        });
      } catch (e) {
        secondsRef.current += seconds;
        // eslint-disable-next-line no-console
        console.warn("[useStudyTime] failed to save study session", e);
      }
    };

    // Count one second per tick while the tab is visible and the user is active.
    // On crossing the idle threshold, bank the stint (flush no-ops if < 60s).
    const tick = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivityRef.current > IDLE_LIMIT_MS) {
        flush("inactivity");
        return;
      }
      secondsRef.current += 1;
    }, 1000);

    // Bank on tab hide and on page unload so navigating away persists the stint.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush("hidden");
    };
    const onPageHide = () => {
      flush("pagehide");
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      activityEvents.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      clearInterval(tick);
      flush("unmount");
      if (activeOwner === owner) activeOwner = null;
    };
  }, [enabled]);
}
