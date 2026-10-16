"use client";

// The verb part of a Backpack card ("Verbos en Flashcards"): the exact form
// met in the video with its pronunciation, meaning there and grammar, the
// sentence with the verb marked, the other forms met in other videos, and a
// collapsible conjugation table with the form(s) used highlighted.
// Renders nothing for cards that are not verb cards (no verb_forms).
//
// The conjugation table is fetched only when opened, from the shared
// verb_lexicon (verbConjugations edge function: made once per verb for
// everyone) and kept for the session.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  conjugationRequest, grammarChips, highlightParts, otherOccurrences, pickOccurrence,
  seenSlots, SLOT_LABELS, TENSES_SHOWN, usedSlot, verbForms,
} from "@/lib/verbCard";
import { CONJUGATION_SLOTS, type VerbOccurrence } from "@/lib/verbs";
import { isRTLText } from "@/lib/language";

/** Taps and drags inside must not move or swipe the card around it. */
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

const TENSE_TAB: Record<string, string> = { past: "Past", present: "Present", future: "Future", imperative: "Imperative" };

export type LoadConjugations = (body: ReturnType<typeof conjugationRequest>) => Promise<any>;

const defaultLoad: LoadConjugations = (body) => (base44 as any).functions.invoke("verbConjugations", body);

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
  const rtl = isRTLText(occ.surface);

  return (
    <div className={`w-full text-left ${className}`}>
      <div className={`rounded-2xl border border-indigo-100 bg-indigo-50 ${compact ? "p-2" : "p-3"}`}>
        <p className="truncate text-[10px] font-bold uppercase tracking-wider text-indigo-400">
          📺 From the video{occ.video_title ? ` · ${occ.video_title}` : ""}
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5" dir={rtl ? "rtl" : "ltr"}>
          <span className={`${compact ? "text-base" : "text-xl"} font-extrabold leading-tight text-indigo-950`}>{occ.surface}</span>
          {occ.phonetic && <span dir="ltr" className={`${compact ? "text-xs" : "text-sm"} italic text-indigo-500`}>{occ.phonetic}</span>}
        </div>
        {occ.translation && !hideMeaning && <p className="mt-0.5 text-sm font-medium text-slate-700">“{occ.translation}”</p>}
        {chips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {chips.map((c) => (
              <span key={c} className={`rounded-full bg-white ${compact ? "px-1.5 text-[10px]" : "px-2 text-[11px]"} py-0.5 font-semibold text-indigo-700 ring-1 ring-indigo-100`}>{c}</span>
            ))}
          </div>
        )}
        {showSentence && occ.sentence && (
          <p dir={isRTLText(occ.sentence) ? "rtl" : "ltr"} className="mt-2 rounded-xl bg-white px-3 py-2 text-sm leading-relaxed text-slate-600">
            {highlightParts(occ.sentence, occ.surface).map((p, i) =>
              p.hit
                ? <mark key={i} className="rounded bg-amber-200/80 px-0.5 font-bold text-indigo-950">{p.text}</mark>
                : <span key={i}>{p.text}</span>
            )}
          </p>
        )}
        {others.length > 0 && !compact && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" onPointerDownCapture={stop}>
            <span className="text-[11px] text-slate-400">Also seen as</span>
            {others.map((o) => (
              <button
                key={`${o.surface}|${o.video_id || ""}`}
                onClick={(e) => { stop(e); setPicked(o); }}
                className="max-w-full truncate rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-indigo-100 hover:ring-indigo-300"
              >
                <span dir="auto" className="font-semibold">{o.surface}</span>
                {o.video_title && <span className="text-slate-400"> · {o.video_title}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <ConjugationPanel word={word} occ={occ} language={language} load={loadConjugations} compact={compact} />
    </div>
  );
}

function ConjugationPanel({ word, occ, language, load, compact = false }: { word: any; occ: VerbOccurrence; language: string; load: LoadConjugations; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const canLoad = /hebrew/i.test(language) && !!word?.lemma_key;
  const q = useQuery({
    queryKey: ["verbConjugations", language, word?.lemma_key],
    queryFn: () => load(conjugationRequest(word, language)),
    enabled: open && canLoad,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    // Someone else is making this verb's table: look again shortly.
    refetchInterval: (query) => (query.state.data?.status === "pending" && query.state.dataUpdateCount < 10 ? 3000 : false),
  });
  if (!canLoad) return null;
  const table = q.data?.status === "ready" ? q.data.entry?.conjugations : null;
  // The cell of the form used, confirmed against the table's own forms.
  const used = usedSlot(table, occ);
  const seen = seenSlots(word, table);
  const tenses = table ? TENSES_SHOWN.filter((t) => Object.keys(table[t] || {}).length) : TENSES_SHOWN;
  const tab = picked && tenses.includes(picked as any) ? picked : used?.tense || tenses[0] || "past";
  const setTab = setPicked;
  const cells = (table?.[tab] || {}) as Record<string, { he: string; phonetic?: string }>;
  const waiting = q.isFetching || q.data?.status === "pending";
  const failed = q.isError || q.data?.status === "failed" || q.data?.status === "limited";

  return (
    <div className="mt-2" onPointerDownCapture={stop}>
      <button
        onClick={(e) => { stop(e); setOpen((v) => !v); }}
        aria-expanded={open}
        className={`flex w-full items-center justify-between rounded-xl border border-indigo-100 bg-white ${compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"} font-bold text-indigo-600 hover:bg-indigo-50/60`}
      >
        <span>Conjugations</span>
        <span className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="mt-1.5 rounded-xl border border-indigo-100 bg-white p-2">
          <div className="flex gap-1 overflow-x-auto pb-1">
            {tenses.map((t) => (
              <button
                key={t}
                onClick={(e) => { stop(e); setTab(t); }}
                className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${tab === t ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-500"}`}
              >
                {TENSE_TAB[t]}{used?.tense === t ? " •" : ""}
              </button>
            ))}
          </div>
          <div className={`mt-1 ${compact ? "max-h-48" : "max-h-64"} overflow-y-auto overscroll-contain`}>
            {table ? (
              <div className={`grid grid-cols-2 gap-1.5 ${compact ? "" : "sm:grid-cols-3"}`}>
                {(CONJUGATION_SLOTS as any)[tab].map((s: string) => {
                  const c = cells[s];
                  const isUsed = used?.tense === tab && used.slot === s;
                  const isSeen = !isUsed && seen.has(`${tab}:${s}`);
                  return (
                    <div
                      key={s}
                      className={`rounded-lg px-2 py-1.5 ${isUsed ? "bg-amber-100 ring-2 ring-amber-400" : isSeen ? "bg-indigo-50 ring-1 ring-indigo-200" : "bg-slate-50"}`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{SLOT_LABELS[tab]?.[s] || s}</p>
                      <p dir="rtl" className="text-right text-base font-bold text-slate-900">{c?.he || "—"}</p>
                      {c?.phonetic && <p className="truncate text-[11px] italic text-indigo-500">{c.phonetic}</p>}
                    </div>
                  );
                })}
              </div>
            ) : waiting ? (
              <p className="py-4 text-center text-xs text-slate-400">Preparing the conjugations…</p>
            ) : failed ? (
              <div className="py-3 text-center text-xs text-slate-500">
                {q.data?.status === "limited" ? "Too many new verbs today — try again tomorrow." : "Couldn't load the conjugations."}
                {q.data?.status !== "limited" && (
                  <button onClick={(e) => { stop(e); q.refetch(); }} className="ml-2 font-semibold text-indigo-600 underline">Retry</button>
                )}
              </div>
            ) : null}
          </div>
          {table && used && (
            <p className="mt-1 text-[10px] text-slate-400"><span className="inline-block h-2 w-2 rounded-sm bg-amber-300 align-middle" /> used in this video{seen.size > 1 ? " · " : ""}{seen.size > 1 && <><span className="inline-block h-2 w-2 rounded-sm bg-indigo-200 align-middle" /> seen in your other videos</>}</p>
          )}
        </div>
      )}
    </div>
  );
}
