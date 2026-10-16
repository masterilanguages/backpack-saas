// Words saved without waiting for their analysis (verb_check = 'pending',
// migration 2200) are analyzed here, in the background: a lesson's
// recommended words, typed words, an analysis that timed out. If the tab is
// closed first, they stay pending and the next visit picks them up.
//
// AI use: one call for all the claimed words (answers already in the session
// cache are reused, not asked again). claim_verb_checks hands a word to one
// caller only, so two tabs never pay for the same word, and a word is tried
// at most twice.
//
// Pure (dependencies passed in): `deno test --unstable-sloppy-imports lib/verbChecks.test.ts`.

import { analyzeWordsTogether, cachedAnalysis, verbCardFor, type SaveWordDeps, type SaveWordOptions } from "./saveWord";
import { parseVerbAnalysis, type VerbOccurrence } from "./verbs";
import type { VerbCardFields } from "./saveWord";

export type VerbCheckDeps = Pick<SaveWordDeps, "analyze" | "label" | "translitRules" | "log" | "onVerbCard"> & {
  /** claim_verb_checks: the caller's pending words (all, or these ids), now theirs to check. */
  claim(ids?: string[] | null): Promise<any[]>;
  /** resolve_verb_check: card + form for a verb, nulls for any other word. */
  resolve(wordId: string, card: VerbCardFields | null, occurrence: VerbOccurrence | null): Promise<{ action: string; word?: any }>;
};

export type VerbCheckResult = { checked: number; aiCalls: number; actions: Record<string, number> };

export async function processVerbChecks(
  deps: VerbCheckDeps,
  opts: SaveWordOptions & { batchTimeoutMs?: number },
  ids?: string[] | null,
): Promise<VerbCheckResult> {
  const out: VerbCheckResult = { checked: 0, aiCalls: 0, actions: {} };
  const rows = (await deps.claim(ids && ids.length ? ids : null)) || [];
  if (!rows.length) return out;

  const items = rows.map((r: any) => ({
    surface: String(r.word || ""),
    sentence: String(r.example_sentence || r.sentence_context || ""),
    language: String(r.language || "hebrew").toLowerCase(),
  }));
  // Answers the session already has (e.g. the popup's own, late) are reused.
  const cached = items.map((it) => cachedAnalysis(it.language, it.surface, it.sentence));
  const batch = await analyzeWordsTogether(
    items.filter((_, i) => !cached[i]),
    { ...deps, createWord: async () => null, saveVerbOccurrence: async () => ({ word: null, created: false }) },
    opts,
  );
  out.aiCalls = batch.aiCalls;
  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const it = items[i];
    let analysis: any;
    if (cached[i]) {
      try { analysis = await cached[i]; } catch { continue; } // stays 'checking': retried later
    } else {
      const raw = batch.results[n++];
      // The call failed or skipped this word: it stays 'checking' and is
      // claimed again later (at most twice in all).
      if (batch.failed || raw == null) continue;
      analysis = parseVerbAnalysis(raw, it.language, it.surface);
    }
    try {
      let res;
      if (!analysis) {
        res = await deps.resolve(row.id, null, null);
      } else {
        const { card, occurrence } = verbCardFor(row, analysis, it.surface, it.sentence || null, it.language);
        res = await deps.resolve(row.id, card, occurrence);
      }
      out.checked++;
      // A verb card now exists: its conjugation table starts being prepared.
      if (analysis && res.word && res.action !== "skipped" && res.action !== "missing") {
        try { deps.onVerbCard?.(res.word); } catch { /* never blocks the check */ }
      }
      out.actions[res.action] = (out.actions[res.action] || 0) + 1;
    } catch (e) {
      deps.log?.("[verbChecks] could not resolve a word", { id: row.id, error: e });
    }
  }
  return out;
}
