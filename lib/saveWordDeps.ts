// The app's dependencies for lib/saveWord and lib/verbChecks, and the verb
// feature flag (NEXT_PUBLIC_VERB_FORMS_LANGS, off by default).
import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabaseClient";
import { QUALITY_MODEL, translitRules } from "@/lib/chapterPrompts";
import { languageLabel } from "@/lib/language";
import { markForVerbCheck, type SaveWordDeps, type SaveWordOptions } from "@/lib/saveWord";
import { processVerbChecks, type VerbCheckDeps, type VerbCheckResult } from "@/lib/verbChecks";
import { conjugationRequest } from "@/lib/verbCard";
import { hasConjugations } from "@/lib/verbs";
import { useEffect, useRef } from "react";

/**
 * Languages whose verbs are saved by infinitive, e.g. "hebrew". Empty (the
 * default) keeps every save exactly as before.
 */
export const VERB_FORMS_LANGUAGES: string[] = (process.env.NEXT_PUBLIC_VERB_FORMS_LANGS || "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export const saveWordOptions: SaveWordOptions = { enabledLanguages: VERB_FORMS_LANGUAGES, timeoutMs: 10_000 };

/** Whether verbs of this language are saved by infinitive. */
export const verbFormsEnabled = (language?: string | null) =>
  VERB_FORMS_LANGUAGES.includes(String(language || "hebrew").toLowerCase());

export const saveWordDeps: SaveWordDeps = {
  createWord: (row) => (base44 as any).entities.Word.create(row),
  async saveVerbOccurrence(card, occurrence) {
    const { data, error } = await (supabase as any).rpc("save_verb_occurrence", { p_word: card, p_occurrence: occurrence });
    if (error) throw error;
    return { word: data?.word, created: data?.created === true };
  },
  // The quality model first, the default one if it errors (as invokeQuality in home).
  async analyze(prompt, schema) {
    try {
      return await base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: schema, model: QUALITY_MODEL });
    } catch {
      return await base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: schema });
    }
  },
  label: (language) => languageLabel(language),
  translitRules: (label) => translitRules(label),
  log: (message, error) => console.error(message, error),
};

// ------------------------------------------------- words checked later (verb_check)

export const verbCheckDeps: VerbCheckDeps = {
  async claim(ids) {
    const { data, error } = await (supabase as any).rpc("claim_verb_checks", { p_ids: ids || null });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  },
  async resolve(wordId, card, occurrence) {
    const { data, error } = await (supabase as any).rpc("resolve_verb_check", { p_word_id: wordId, p_word: card, p_occurrence: occurrence });
    if (error) throw error;
    return data || { action: "unknown" };
  },
  analyze: saveWordDeps.analyze,
  label: saveWordDeps.label,
  translitRules: saveWordDeps.translitRules,
  log: saveWordDeps.log,
};

let running: Promise<VerbCheckResult | null> | null = null;
let again: string[] | null | undefined;

/**
 * Checks the student's pending words in the background (one at a time per
 * tab; a request made meanwhile runs right after). Never throws.
 */
export function runVerbChecks(ids?: string[] | null, onDone?: (r: VerbCheckResult | null) => void): Promise<VerbCheckResult | null> {
  if (!VERB_FORMS_LANGUAGES.length) return Promise.resolve(null);
  if (running) {
    again = again === undefined ? ids ?? null : again && ids ? [...again, ...ids] : null;
    return running.then(() => runVerbChecks(undefined, onDone));
  }
  const pick = again !== undefined ? again : ids;
  again = undefined;
  running = processVerbChecks(verbCheckDeps, saveWordOptions, pick)
    .catch((e) => { console.error("[verbChecks] failed", e); return null; })
    .finally(() => { running = null; });
  return running.then((r) => { onDone?.(r); return r; });
}

/**
 * On a Backpack screen: words still waiting for their check (the tab was
 * closed, an analysis timed out) are checked once the words are loaded.
 */
export function useResumeVerbChecks(words: any[] | undefined, onChanged: () => void) {
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || !VERB_FORMS_LANGUAGES.length || !Array.isArray(words)) return;
    if (!words.some((w) => w?.verb_check === "pending" || w?.verb_check === "checking")) return;
    tried.current = true;
    runVerbChecks(null, (r) => { if (r && r.checked) onChanged(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);
}

/**
 * For a save that doesn't wait for an analysis (typed words, lists, words
 * from a sentence): the row as before, marked for a later check when verbs
 * are on. Use with checkLater on the created row.
 */
export const markRow = <T extends Record<string, any>>(row: T): T => markForVerbCheck(row, saveWordOptions);

/** Checks just-saved rows in the background (one batch for all), if they were marked. */
export function checkLater(created: any | any[], onChanged?: () => void) {
  const ids = (Array.isArray(created) ? created : [created])
    .filter((r) => r?.id && r.verb_check === "pending").map((r) => String(r.id));
  if (ids.length) runVerbChecks(ids, (r) => { if (r && r.checked) onChanged?.(); });
}

// ------------------------------------------------------- conjugation tables

/** Verbs whose table this tab asked for, and when. */
const preparing = new Map<string, number>();
const tableKey = (language: string, lemmaKey: string) => `${language}|${lemmaKey}`;

/**
 * Starts preparing a verb card's conjugation table (all four tenses, one AI
 * call, stored in verb_lexicon for everyone) right after the card is saved.
 * Never awaited: saving is not slowed down. The edge function answers at once
 * and keeps working on the server, so closing the page doesn't stop it; an
 * existing table costs nothing. Once per verb per tab.
 */
export function prepareConjugations(card: any) {
  const language = String(card?.language || "hebrew").toLowerCase();
  if (!card?.lemma_key || !card?.word || !VERB_FORMS_LANGUAGES.includes(language)) return;
  const k = tableKey(language, card.lemma_key);
  if (preparing.has(k)) return;
  preparing.set(k, Date.now());
  (base44 as any).functions.invoke("verbConjugations", { ...conjugationRequest(card, language), prepare: true })
    .catch((e: any) => { preparing.delete(k); console.warn("[verbConjugations] prepare request failed", e); });
}

saveWordDeps.onVerbCard = prepareConjugations;
verbCheckDeps.onVerbCard = prepareConjugations;

/** A table still "pending" this long after its last change was abandoned (longer than the 400 s lease). */
const ABANDONED_MS = 7 * 60 * 1000;

/**
 * A verb card's conjugation table, read straight from verb_lexicon (no AI, no
 * edge function). Being made → "pending" (the caller looks again shortly; no
 * second request). Missing, failed, or abandoned → asks the server to prepare
 * it once (recovery: e.g. the page closed before the first request left); the
 * server's claim prevents a duplicate call and caps the attempts.
 */
export async function loadConjugationTable(card: any, language: string): Promise<{ status: "ready" | "pending" | "failed"; entry?: any }> {
  const lang = String(language || "hebrew").toLowerCase();
  const { data, error } = await (supabase as any).from("verb_lexicon")
    .select("language, lemma_key, lemma, lemma_phonetic, lemma_meaning, binyan, root, conjugations, status, updated_at")
    .eq("language", lang).eq("lemma_key", card.lemma_key).maybeSingle();
  if (error) throw error;
  if (data && hasConjugations(data.conjugations)) return { status: "ready", entry: data };
  const k = tableKey(lang, card.lemma_key);
  const abandoned = data?.status === "pending" && Date.now() - Date.parse(data.updated_at || "") > ABANDONED_MS;
  if (data?.status === "pending" && !abandoned) return { status: "pending" };
  if (data?.status === "failed" && preparing.has(k)) return { status: "failed" };
  // Asked a while ago and still no row: the server refused (e.g. too many new
  // verbs today) — say so instead of "Preparing…" forever.
  if (!data && preparing.has(k) && Date.now() - (preparing.get(k) || 0) > 20_000) return { status: "failed" };
  prepareConjugations({ ...card, language: lang });
  return { status: "pending" };
}

/** "Retry" after a failed table: the next load asks the server again. */
export function forgetConjugationRequest(card: any, language: string) {
  preparing.delete(tableKey(String(language || "hebrew").toLowerCase(), card?.lemma_key || ""));
}
