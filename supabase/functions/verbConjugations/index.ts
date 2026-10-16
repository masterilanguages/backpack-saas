// verbConjugations — the conjugation table of a verb on the student's card,
// made once for everyone and kept in verb_lexicon (migration 2200). The logic
// is in ./conjugate.ts; this file only wires the request.
//
// Request: { language: "hebrew", lemma, lemma_phonetic?, lemma_meaning?, binyan?, root? }
// Reply:   200 { status: "ready", cached, entry } · 202 { status: "pending" }
//          (another request is making it; ask again) · 502 { status: "failed" }
//          · 429 { status: "limited" } (too many new verbs today)
//          · 400 bad request · 403 the verb is not on the caller's cards.
import { handleCors, json } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/auth.ts";
import { askJson } from "../_shared/llm.ts";
import { QUALITY_MODEL, translitRules } from "../../../lib/chapterPrompts.ts";
import { handleConjugationRequest, type ConjugateDeps } from "./conjugate.ts";
import { SupabaseLexiconStore } from "./store.ts";

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  const auth = await requireUser(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const email = String(auth.user.email || "");
  const admin = String((auth.user.app_metadata as any)?.user_role || "user") === "admin";

  const db = serviceClient();
  const deps: ConjugateDeps = {
    store: new SupabaseLexiconStore(db),
    // The quality model only: a cheaper fallback would store a weaker table
    // for everyone and make one attempt cost two calls.
    llm: (prompt, schema, model, maxTokens) => askJson(prompt, schema, { model, maxTokens }),
    model: QUALITY_MODEL,
    translitRules,
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (m) => console.log(m),
  };
  const caller = {
    admin,
    email,
    async ownsVerb(language: string, lemmaKey: string) {
      if (!email) return false;
      const { data } = await db.from("word").select("id")
        .eq("language", language).eq("lemma_key", lemmaKey)
        .ilike("created_by", email.replace(/[\\%_]/g, "\\$&")).limit(1);
      return !!data?.length;
    },
  };

  try {
    const body = await req.json().catch(() => ({}));
    const out = await handleConjugationRequest(deps, caller, body);
    return json(out.body, out.status);
  } catch (e) {
    console.error("[verbConjugations] failed", e);
    return json({ error: "Could not get the conjugations" }, 500);
  }
});
