// The app's dependencies for lib/saveWord and lib/verbChecks, and the verb
// feature flag (NEXT_PUBLIC_VERB_FORMS_LANGS, off by default).
import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabaseClient";
import { QUALITY_MODEL, translitRules } from "@/lib/chapterPrompts";
import { languageLabel } from "@/lib/language";
import { markForVerbCheck, type SaveWordDeps, type SaveWordOptions } from "@/lib/saveWord";
import { processVerbChecks, type VerbCheckDeps, type VerbCheckResult } from "@/lib/verbChecks";
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
