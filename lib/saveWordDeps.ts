// The app's dependencies for lib/saveWord, and the verb feature flag.
// Not used by any screen yet (phase 1 of "Verbos en Flashcards").
import { base44 } from "@/api/base44Client";
import { supabase } from "@/api/supabaseClient";
import { QUALITY_MODEL, translitRules } from "@/lib/chapterPrompts";
import { languageLabel } from "@/lib/language";
import type { SaveWordDeps, SaveWordOptions } from "@/lib/saveWord";

/**
 * Languages whose verbs are saved by infinitive, e.g. "hebrew". Empty (the
 * default) keeps every save exactly as before.
 */
export const VERB_FORMS_LANGUAGES: string[] = (process.env.NEXT_PUBLIC_VERB_FORMS_LANGS || "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export const saveWordOptions: SaveWordOptions = { enabledLanguages: VERB_FORMS_LANGUAGES, timeoutMs: 10_000 };

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
