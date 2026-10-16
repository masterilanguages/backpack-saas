"use client";

// The verb part of a Backpack card ("Verbos en Flashcards"): the exact form
// met in the video with its pronunciation, meaning there and grammar, the
// sentence with the verb marked, the other forms met in other videos, and a
// "Conjugations" row that opens a bottom sheet with the conjugation table
// (the form(s) used highlighted). Renders nothing for cards that are not verb
// cards (no verb_forms). Same visual language as the Library of videos:
// white surfaces with a hairline ring, display-font titles, slate text.
//
// The conjugation table (made once per verb for everyone, right after the
// verb is saved) is read from verb_lexicon as soon as the card shows, so
// opening Conjugations and switching tenses is instant and never calls the AI.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { forgetConjugationRequest, loadConjugationTable } from "@/lib/saveWordDeps";
import {
  grammarChips, highlightParts, otherOccurrences, pickOccurrence,
  seenSlots, SLOT_LABELS, TENSES_SHOWN, usedSlot, verbForms,
} from "@/lib/verbCard";
import { CONJUGATION_SLOTS, type VerbOccurrence } from "@/lib/verbs";
import { isRTLText } from "@/lib/language";

/** Taps and drags inside must not move, flip or swipe the card around it. */
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

const TENSE_TAB: Record<string, string> = { past: "Past", present: "Present", future: "Future", imperative: "Imperative" };
const RING = "shadow-[0_0_0_1px_#ECECF3]";
const DISPLAY = "[font-family:var(--font-display),var(--font-hebrew)]";
const HE = "[font-family:var(--font-hebrew),var(--font-body)]";

export type LoadConjugations = (word: any, language: string) => Promise<{ status: "ready" | "pending" | "failed"; entry?: any }>;

const defaultLoad: LoadConjugations = loadConjugationTable;

export default function VerbDetails({
  word,
  videoId = null,
  language = "hebrew",
  showSentence = true,
  hideMeaning = false,
  compact = false,
  loadConjugations = defaultLoad,
  className = "",
}: {
  word: any;
  /** The deck's video: its own form and sentence are shown. */
  videoId?: string | null;
  language?: string;
  /** Off where the card already shows the sentence (it gets the form to mark). */
  showSentence?: boolean;
  /** Study mode before the student taps to reveal: no meaning. */
  hideMeaning?: boolean;
  /** Small grid tiles (/library): tighter, no other forms list. */
  compact?: boolean;
  loadConjugations?: LoadConjugations;
  className?: string;
}) {
  const deckOcc = useMemo(() => pickOccurrence(word, videoId), [word, videoId]);
  const [picked, setPicked] = useState<VerbOccurrence | null>(null);
  // A form picked under "Also seen as" — only while it belongs to this card.
  const occ = picked && verbForms(word).includes(picked) ? picked : deckOcc;
  if (!occ) return null;
  const others = otherOccurrences(word, occ);
  const chips = grammarChips(occ);

  return (
    <div className={`w-full text-left ${className}`}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
          {/* The title may be Hebrew: isolated, so it keeps its own direction. */}
          In the video{occ.video_title ? <> · <bdi className="font-semibold normal-case tracking-normal">{occ.video_title}</bdi></> : ""}
        </span>
        <span className="h-px flex-1 bg-[#ECECF3]" />
      </div>
      <div className={`${compact ? "mt-1.5" : "mt-2.5"} flex items-baseline justify-between gap-3`}>
        <span className={`min-w-0 truncate ${compact ? "text-[13px]" : "text-[15px]"} font-semibold text-slate-900`}>
          {!hideMeaning && occ.translation ? occ.translation : ""}
        </span>
        <bdi className={`flex-shrink-0 ${compact ? "text-[19px]" : "text-[26px]"} font-extrabold leading-none text-slate-900 ${HE}`}>{occ.surface}</bdi>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className={`min-w-0 ${compact ? "text-[11px]" : "text-[13px]"} text-slate-500`}>{chips.join(" · ")}</span>
        {occ.phonetic && <span className={`flex-shrink-0 ${compact ? "text-[11px]" : "text-[13px]"} text-slate-400`}>{occ.phonetic}</span>}
      </div>
      {showSentence && occ.sentence && (
        <p dir={isRTLText(occ.sentence) ? "rtl" : "ltr"} className={`mt-3 text-[16px] leading-relaxed text-slate-600 ${HE}`}>
          {highlightParts(occ.sentence, occ.surface).map((p, i) =>
            p.hit
              ? <mark key={i} className="rounded-md bg-amber-100 px-1 font-bold text-slate-900">{p.text}</mark>
              : <span key={i}>{p.text}</span>
          )}
        </p>
      )}
      {others.length > 0 && !compact && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" onPointerDownCapture={stop}>
          <span className="text-xs text-slate-400">Also seen as</span>
          {others.map((o) => (
            <button
              key={`${o.surface}|${o.video_id || ""}`}
              onClick={(e) => { stop(e); setPicked(o); }}
              // A Hebrew form reads right to left: the form first (rightmost), then its video.
              dir={isRTLText(o.surface) ? "rtl" : "ltr"}
              className={`max-w-full truncate rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 ${RING} hover:bg-slate-50`}
            >
              <bdi className={`font-semibold text-slate-800 ${HE}`}>{o.surface}</bdi>
              {o.video_title && <span className="text-slate-400"> · <bdi>{o.video_title}</bdi></span>}
            </button>
          ))}
        </div>
      )}
      <Conjugations word={word} occ={occ} language={language} load={loadConjugations} compact={compact} hideMeaning={hideMeaning} />
    </div>
  );
}

function Conjugations({ word, occ, language, load, compact, hideMeaning }: {
  word: any; occ: VerbOccurrence; language: string; load: LoadConjugations; compact: boolean; hideMeaning: boolean;
}) {
  const [open, setOpen] = useState(false);
  const canLoad = /hebrew/i.test(language) && !!word?.lemma_key;
  const q = useQuery({
    queryKey: ["verbConjugations", language, word?.lemma_key],
    // Read as soon as the card shows (not when Conjugations is opened).
    queryFn: () => load(word, language),
    enabled: canLoad,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    // Still being made: look at verb_lexicon again shortly (a read, no AI call).
    refetchInterval: (query) => (query.state.data?.status === "pending" && query.state.dataUpdateCount < 60 ? 3000 : false),
  });
  if (!canLoad) return null;
  const table = q.data?.status === "ready" ? q.data.entry?.conjugations : null;
  const waiting = !table && (q.isLoading || q.data?.status === "pending");
  const failed = !table && (q.isError || q.data?.status === "failed");

  return (
    <>
      <button
        onPointerDownCapture={stop}
        onClick={(e) => { stop(e); setOpen(true); }}
        aria-haspopup="dialog"
        className={`mt-4 flex w-full items-center gap-3 rounded-[18px] bg-white ${compact ? "px-3 py-2" : "px-3.5 py-3"} text-left ${RING} transition hover:bg-slate-50 active:scale-[.99]`}
      >
        <span className="min-w-0 flex-1">
          <span className={`block ${compact ? "text-[14px]" : "text-[16px]"} font-extrabold leading-tight tracking-[-0.01em] text-slate-900 ${DISPLAY}`}>Conjugations</span>
          {!compact && <span className="mt-0.5 block truncate text-[12px] text-slate-500">All tenses · your form marked</span>}
        </span>
        {waiting && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">Preparing</span>}
        <span className={`flex ${compact ? "h-7 w-7" : "h-9 w-9"} flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-white`}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} word={word} hideMeaning={hideMeaning}>
        {table ? (
          <Table word={word} occ={occ} table={table} />
        ) : failed ? (
          <div className="py-10 text-center text-sm text-slate-500">
            Couldn't load the conjugations.
            <button onClick={() => { forgetConjugationRequest(word, language); q.refetch(); }} className="ml-2 font-bold text-slate-900 underline">Retry</button>
          </div>
        ) : (
          <Preparing word={word} />
        )}
      </Sheet>
    </>
  );
}

/** Bottom sheet over the whole screen (a portal, so the card's drag/transform can't reach it). */
function Sheet({ open, onClose, word, hideMeaning, children }: {
  open: boolean; onClose: () => void; word: any; hideMeaning: boolean; children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  // Only the top of the sheet drags it down; the table below scrolls normally (touch included).
  const drag = useDragControls();
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!mounted) return null;
  const sub = [word?.phonetic, hideMeaning ? null : word?.translation].filter(Boolean).join(" · ");
  return createPortal(
    // React events bubble through portals: stop them here so the card (swipe, flip) never sees them.
    <div onPointerDown={stop} onClick={stop} onTouchStart={stop}>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-[90] bg-slate-900/30"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.div
              key="sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Conjugations"
              className="fixed inset-x-0 bottom-0 z-[91] mx-auto flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-[28px] bg-white text-left shadow-[0_-12px_40px_-16px_rgba(15,23,42,.35)] [font-family:var(--font-body),var(--font-hebrew)]"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 320 }}
              drag="y" dragControls={drag} dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_: any, info: any) => { if (info.offset.y > 120) onClose(); }}
            >
              <div className="flex-shrink-0 cursor-grab touch-none px-5 pt-2.5 active:cursor-grabbing" onPointerDown={(e) => drag.start(e)}>
                <div className="mx-auto h-1 w-9 rounded-full bg-slate-200" />
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={`text-[30px] font-extrabold leading-none text-slate-900 ${HE}`}><bdi>{word?.word}</bdi></div>
                    {sub && <div className="mt-1.5 text-[13px] text-slate-500">{sub}</div>}
                  </div>
                  <button
                    onClick={onClose}
                    aria-label="Close"
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              </div>
              {/* The only scroll inside the sheet; dragging here scrolls, it doesn't move the sheet. */}
              <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                {children}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

/** One person per row: label left, Hebrew right; the video's form marked. */
function Table({ word, occ, table }: { word: any; occ: VerbOccurrence; table: any }) {
  // The cell of the form used, confirmed against the table's own forms.
  const used = usedSlot(table, occ);
  const seen = seenSlots(word, table);
  const tenses = TENSES_SHOWN.filter((t) => Object.keys(table?.[t] || {}).length);
  const [picked, setPicked] = useState<string | null>(null);
  const tab = picked && tenses.includes(picked as any) ? picked : used?.tense || tenses[0] || "past";
  const cells = (table?.[tab] || {}) as Record<string, { he: string; phonetic?: string }>;
  const usedRef = useRef<HTMLDivElement>(null);
  useEffect(() => { usedRef.current?.scrollIntoView({ block: "nearest" }); }, [tab]);

  return (
    <>
      <div className="sticky top-0 z-10 -mx-5 bg-white px-5 pb-3 pt-1">
        <div className="grid gap-1 rounded-[14px] bg-slate-100 p-1" style={{ gridTemplateColumns: `repeat(${tenses.length || 1}, minmax(0, 1fr))` }}>
          {tenses.map((t) => (
            <button
              key={t}
              onClick={() => setPicked(t)}
              aria-pressed={tab === t}
              className={`relative rounded-[10px] py-2 text-[12px] font-bold transition ${tab === t ? "bg-white text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,.12)]" : "text-slate-500"}`}
            >
              {TENSE_TAB[t]}
              {used?.tense === t && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-400" aria-label="used in the video" />}
            </button>
          ))}
        </div>
      </div>
      <div className={`overflow-hidden rounded-[18px] bg-white ${RING}`}>
        {((CONJUGATION_SLOTS as any)[tab] || []).map((s: string, i: number) => {
          const c = cells[s];
          const isUsed = used?.tense === tab && used.slot === s;
          const isSeen = !isUsed && seen.has(`${tab}:${s}`);
          return (
            <div
              key={s}
              ref={isUsed ? usedRef : undefined}
              data-used={isUsed ? "1" : undefined}
              className={`flex items-center gap-3 px-4 py-2.5 ${i ? "border-t border-[#F1F1F6]" : ""} ${isUsed ? "bg-amber-50" : ""}`}
            >
              <span className="w-24 flex-shrink-0">
                <span className="block text-[13px] font-semibold text-slate-500">{SLOT_LABELS[tab]?.[s] || s}</span>
                {isUsed && <span className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">In the video</span>}
                {isSeen && <span className="mt-0.5 inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-500">You've seen it</span>}
              </span>
              <span className="min-w-0 flex-1 text-right">
                <span dir="rtl" className={`block text-[20px] font-bold leading-tight text-slate-900 ${HE}`}>{c?.he || "—"}</span>
                {c?.phonetic && <span className="block truncate text-[12px] text-slate-400">{c.phonetic}</span>}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

const SHIMMER_CSS = `
@keyframes bp-flip { 0%,20% { transform: rotateY(0deg); } 50%,70% { transform: rotateY(180deg); } 100% { transform: rotateY(360deg); } }
@keyframes bp-shimmer { 0% { background-position: -240px 0; } 100% { background-position: 240px 0; } }
.bp-flip { animation: bp-flip 2.6s cubic-bezier(.6,0,.3,1) infinite; transform-style: preserve-3d; }
.bp-shimmer { background: linear-gradient(90deg, #F1F1F6 0px, #F8F8FB 80px, #F1F1F6 160px); background-size: 480px 100%; animation: bp-shimmer 1.5s linear infinite; }
@media (prefers-reduced-motion: reduce) { .bp-flip, .bp-shimmer { animation: none; } }
`;

/** While the shared table is still being made: the word is already saved. */
function Preparing({ word }: { word: any }) {
  return (
    <div data-preparing="1">
      <style>{SHIMMER_CSS}</style>
      <div className="flex flex-col items-center px-4 pb-5 pt-3 text-center">
        <div style={{ perspective: 400 }}>
          <div className={`bp-flip flex h-14 w-11 items-center justify-center rounded-[10px] bg-white ${RING} shadow-[0_6px_16px_-8px_rgba(15,23,42,.35)]`}>
            <span className={`text-xl font-extrabold text-slate-900 ${HE}`}>א</span>
          </div>
        </div>
        <p className={`mt-4 text-[17px] font-extrabold tracking-[-0.01em] text-slate-900 ${DISPLAY}`}>Preparing the conjugations</p>
        <p className="mt-1 max-w-[260px] text-[13px] leading-snug text-slate-500">
          <bdi className={`font-semibold text-slate-700 ${HE}`}>{word?.word}</bdi> is already saved. Keep studying — the table will appear here by itself.
        </p>
      </div>
      <div className={`overflow-hidden rounded-[18px] bg-white ${RING}`} aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`flex items-center gap-3 px-4 py-3.5 ${i ? "border-t border-[#F1F1F6]" : ""}`}>
            <div className="bp-shimmer h-3 w-16 rounded-full" />
            <div className="flex-1" />
            <div className="flex flex-col items-end gap-1.5">
              <div className="bp-shimmer h-4 w-20 rounded-full" />
              <div className="bp-shimmer h-2.5 w-12 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
