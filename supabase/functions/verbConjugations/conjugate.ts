// The conjugation table of one verb, made once for everyone (verb_lexicon).
//
// 1. Already made → returned, no AI call.
// 2. Otherwise the caller claims the verb (verb_lexicon_claim). Only one of
//    two simultaneous callers gets it; the other waits for that table.
// 3. The holder asks the model once, validates the table (lib/verbs
//    parseConjugations) and stores it with its token. A bad or failed answer
//    gives the verb back; after MAX_ATTEMPTS failures nobody pays for it again.
//
// Cost limits: one model call per attempt (the quality model only, no
// fallback), MAX_ATTEMPTS per verb ever, a lease longer than a function run
// (a slow answer is never paid twice), only verbs on the caller's own cards,
// and DAILY_NEW_VERBS new verbs per student a day.

import {
  CONJUGATION_SCHEMA, conjugationPrompt, hasConjugations, lemmaKey, normalizeBinyan,
  parseConjugations, plainSpelling, sameVerbLetters, VERB_PROMPT_VERSION,
} from "../../../lib/verbs.ts";
import { classifyLlmError, isAccountLlmError } from "../../../lib/llmErrors.ts";
import { DailyLimitError, type LexiconRow, type LexiconStore } from "./store.ts";

/** Longer than an edge function may run (400 s on paid plans). */
export const LEASE_SECONDS = 400;
export const DAILY_NEW_VERBS = 30;
export const MAX_ATTEMPTS = 2;
export const WAIT_MS = 20_000;
export const POLL_MS = 1_000;
export const MAX_TOKENS = 6_000;
/** The table's cells are Hebrew persons (lib/verbs CONJUGATION_SLOTS). */
export const SUPPORTED_LANGUAGES = ["hebrew"];

export type ConjugateRequest = {
  language: string;
  /** The card's key (from the full spelling). Must be the lemma's letters. */
  lemma_key?: string;
  lemma: string;
  lemma_phonetic?: string;
  lemma_meaning?: string;
  binyan?: string;
  root?: string;
};

export type LexiconEntry = Pick<LexiconRow, "language" | "lemma_key" | "lemma" | "lemma_phonetic" | "lemma_meaning" | "binyan" | "root" | "conjugations">;

export type ConjugateResult =
  | { status: "ready"; cached: boolean; entry: LexiconEntry }
  | { status: "pending" }
  | { status: "limited"; error: string }
  | { status: "failed"; error: string };

export type ConjugateDeps = {
  store: LexiconStore;
  llm(prompt: string, schema: Record<string, unknown>, model: string, maxTokens: number): Promise<any>;
  model: string;
  translitRules(label: string): string;
  now(): number;
  sleep(ms: number): Promise<void>;
  log(message: string): void;
  /** Tests only: shorter leases and waits. */
  leaseSeconds?: number;
  waitMs?: number;
  pollMs?: number;
  maxAttempts?: number;
  dailyNewLimit?: number;
};

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Checks the request body. A string is the error to return (400). */
export function parseRequest(body: any): ConjugateRequest | string {
  const language = clip(body?.language, 20).toLowerCase() || "hebrew";
  if (!SUPPORTED_LANGUAGES.includes(language)) return `Conjugation tables are only made for: ${SUPPORTED_LANGUAGES.join(", ")}`;
  const lemma = clip(body?.lemma, 40);
  if (!lemma || !lemmaKey(lemma)) return "Provide the verb's infinitive (lemma)";
  const binyan = normalizeBinyan(body?.binyan);
  // The card's own key (made from the standard full spelling, lib/verbs
  // keyOfAnalysis): only when it is the same verb's letters and binyan.
  const given = clip(body?.lemma_key, 80);
  const [base, keyBinyan = ""] = given.split("|");
  const keyOk = !!given && plainSpelling(base) === base && sameVerbLetters(base, lemma) && keyBinyan === binyan;
  if (language === "hebrew" && !/^[א-ת֑-ׇ\s'"׳״-]+$/.test(lemma)) return "The lemma must be written in Hebrew letters";
  return {
    language,
    lemma_key: keyOk ? given : undefined,
    lemma,
    lemma_phonetic: clip(body?.lemma_phonetic, 60) || undefined,
    lemma_meaning: clip(body?.lemma_meaning, 80) || undefined,
    binyan: binyan || undefined,
    root: clip(body?.root, 20) || undefined,
  };
}

const entryOf = (r: LexiconRow): LexiconEntry => ({
  language: r.language, lemma_key: r.lemma_key, lemma: r.lemma, lemma_phonetic: r.lemma_phonetic,
  lemma_meaning: r.lemma_meaning, binyan: r.binyan, root: r.root, conjugations: r.conjugations,
});

export async function getConjugations(deps: ConjugateDeps, req: ConjugateRequest, requestedBy: string | null = null): Promise<ConjugateResult> {
  const { store } = deps;
  const lang = req.language;
  const key = req.lemma_key || lemmaKey(req.lemma, req.binyan);
  const tag = `[verbConjugations ${lang}:${key}]`;
  const maxAttempts = deps.maxAttempts ?? MAX_ATTEMPTS;

  const existing = await store.get(lang, key);
  if (existing && hasConjugations(existing.conjugations)) return { status: "ready", cached: true, entry: entryOf(existing) };

  let claimed: LexiconRow | null;
  try {
    claimed = await store.claim(lang, key, req.lemma, deps.leaseSeconds ?? LEASE_SECONDS, maxAttempts,
      requestedBy, requestedBy ? deps.dailyNewLimit ?? DAILY_NEW_VERBS : null);
  } catch (e) {
    if (e instanceof DailyLimitError) return { status: "limited", error: "Too many new verbs today — try again tomorrow" };
    throw e;
  }
  if (!claimed?.lock_token) {
    // Someone else is making it: wait for their table (no second AI call).
    const deadline = deps.now() + (deps.waitMs ?? WAIT_MS);
    let row = await store.get(lang, key);
    while (deps.now() < deadline) {
      if (row && hasConjugations(row.conjugations)) return { status: "ready", cached: true, entry: entryOf(row) };
      const held = row?.locked_until && Date.parse(row.locked_until) > deps.now();
      if (!held) break;
      await deps.sleep(deps.pollMs ?? POLL_MS);
      row = await store.get(lang, key);
    }
    if (row && hasConjugations(row.conjugations)) return { status: "ready", cached: true, entry: entryOf(row) };
    // Out of attempts and nobody working on it (failed, or the last holder died).
    const held = row?.locked_until && Date.parse(row.locked_until) > deps.now();
    if (row && !held && row.attempts >= maxAttempts) return { status: "failed", error: "This verb's table could not be made" };
    return { status: "pending" };
  }

  const token = claimed.lock_token;
  const giveBack = async (error: string, refund: boolean) => {
    try { await store.fail(lang, key, token, error, refund); } catch (e) { deps.log(`${tag} could not release: ${e}`); }
  };

  let raw: any;
  try {
    const label = lang.charAt(0).toUpperCase() + lang.slice(1);
    raw = await deps.llm(
      conjugationPrompt(label, req.lemma, req.lemma_meaning || "", req.binyan || "", deps.translitRules(label)),
      CONJUGATION_SCHEMA, deps.model, MAX_TOKENS,
    );
  } catch (e) {
    const kind = (e as any)?.kind || classifyLlmError(e);
    deps.log(`${tag} model failed (${kind})`);
    await giveBack(`model: ${kind}`, isAccountLlmError(kind));
    return { status: "failed", error: "The conjugation table could not be made right now" };
  }

  const table = parseConjugations(raw);
  if (!table) {
    deps.log(`${tag} incomplete table, not stored`);
    await giveBack("incomplete table", false);
    return { status: "failed", error: "The conjugation table came back incomplete" };
  }

  const patch = {
    lemma: req.lemma, lemma_phonetic: req.lemma_phonetic, lemma_meaning: req.lemma_meaning,
    binyan: req.binyan, root: req.root, conjugations: table, model: deps.model, prompt_version: VERB_PROMPT_VERSION,
  };
  if (!(await store.save(lang, key, token, patch))) {
    // Lease lost (a very slow answer): whoever holds it now stores theirs.
    deps.log(`${tag} lease lost before saving`);
    const row = await store.get(lang, key);
    if (row && hasConjugations(row.conjugations)) return { status: "ready", cached: true, entry: entryOf(row) };
    return { status: "pending" };
  }
  deps.log(`${tag} made and stored`);
  return {
    status: "ready", cached: false,
    entry: {
      language: lang, lemma_key: key, lemma: req.lemma, lemma_phonetic: req.lemma_phonetic ?? null,
      lemma_meaning: req.lemma_meaning ?? null, binyan: req.binyan ?? null, root: req.root ?? null, conjugations: table,
    },
  };
}

export type Caller = {
  admin: boolean;
  /** Counts toward the daily limit of new verbs (admins: none). */
  email: string;
  /** Whether this verb is on one of the caller's own Backpack cards. */
  ownsVerb(language: string, lemmaKey: string): Promise<boolean>;
};

/**
 * The whole request: validation, then only a verb on the caller's own card
 * (admins: any) may cost an AI call, so nobody can spend tokens on made-up
 * verbs. Returns the HTTP status and body.
 */
export async function handleConjugationRequest(deps: ConjugateDeps, caller: Caller, body: any): Promise<{ status: number; body: any }> {
  const req = parseRequest(body);
  if (typeof req === "string") return { status: 400, body: { error: req } };
  const key = req.lemma_key || lemmaKey(req.lemma, req.binyan);
  if (!caller.admin && !(await caller.ownsVerb(req.language, key))) {
    return { status: 403, body: { error: "This verb is not in your Backpack" } };
  }
  const out = await getConjugations(deps, req, caller.admin ? null : caller.email || null);
  const status = { ready: 200, pending: 202, limited: 429, failed: 502 }[out.status];
  return { status, body: out };
}
