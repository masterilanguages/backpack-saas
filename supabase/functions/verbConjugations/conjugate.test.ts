/// <reference lib="deno.ns" />
// verbConjugations with a fake model: no paid calls. Every scenario runs
// against the in-memory store and — when TEST_DATABASE_URL is set
// (supabase/tests/verb_forms_test.sh) — against the real SQL functions of
// migration 2200 in a local PostgreSQL.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import postgres from "npm:postgres@3.4.4";
import { CONJUGATION_SCHEMA, lemmaKey } from "../../../lib/verbs.ts";
import { clone, LEHANIACH } from "../../../lib/testTables.ts";
import { getConjugations, handleConjugationRequest, LEASE_SECONDS, MAX_TOKENS, type ConjugateDeps, type ConjugateRequest } from "./conjugate.ts";
import { DailyLimitError, MemoryLexiconStore, type LexiconPatch, type LexiconRow, type LexiconStore } from "./store.ts";

const MODEL = "claude-opus-5-5";
const VERB: ConjugateRequest = { language: "hebrew", lemma: "לְהַנִּיחַ", lemma_phonetic: "lehaniach", lemma_meaning: "to put", binyan: "hifil", root: "נ-ו-ח" };
const KEY = lemmaKey(VERB.lemma, VERB.binyan);

function fullTable() {
  return { conjugations: clone(LEHANIACH) as any };
}

// ---------------------------------------------------------------- stores

class SqlLexiconStore implements LexiconStore {
  constructor(public sql: any) {}
  async get(language: string, key: string) {
    const [r]: any[] = await this.sql`select * from verb_lexicon where language = ${language} and lemma_key = ${key}`;
    return r ? this.row(r) : null;
  }
  async claim(language: string, key: string, lemma: string, lease: number, max: number, by: string | null = null, limit: number | null = null) {
    try {
      const [r]: any[] = await this.sql`select * from verb_lexicon_claim(${language}, ${key}, ${lemma}, ${lease}, ${max}, ${by}, ${limit})`;
      return r ? this.row(r) : null;
    } catch (e: any) {
      if (/daily limit/i.test(e?.message || "")) throw new DailyLimitError();
      throw e;
    }
  }
  async save(language: string, key: string, token: string, patch: LexiconPatch) {
    const [r]: any[] = await this.sql`select verb_lexicon_save(${language}, ${key}, ${token}::uuid, ${this.sql.json(patch)}) as ok`;
    return r.ok === true;
  }
  async fail(language: string, key: string, token: string, error: string, refund: boolean) {
    const [r]: any[] = await this.sql`select verb_lexicon_fail(${language}, ${key}, ${token}::uuid, ${error}, ${refund}) as ok`;
    return r.ok === true;
  }
  private row(r: any): LexiconRow {
    return { ...r, lock_token: r.lock_token ? String(r.lock_token) : null, locked_until: r.locked_until ? new Date(r.locked_until).toISOString() : null };
  }
}

interface Harness {
  store: LexiconStore;
  /** Run out the current holder's lease (memory: move the clock; SQL: wait). */
  expire(): Promise<void>;
  now(): number;
  lease: number;
}

function memoryHarness(): Harness {
  const clock = { t: 1_000_000 };
  return { store: new MemoryLexiconStore(() => clock.t), now: () => clock.t, expire: async () => { clock.t += 2_000; }, lease: 1 };
}

function sqlHarness(sql: any): Harness {
  return { store: new SqlLexiconStore(sql), now: () => Date.now(), expire: () => new Promise((r) => setTimeout(r, 1_300)), lease: 1 };
}

// ---------------------------------------------------------------- fakes

function fakes(h: Harness, answer: () => Promise<any> | any = () => fullTable()) {
  const calls = { llm: [] as { prompt: string; schema: any; model: string; maxTokens: number }[], logs: [] as string[] };
  const deps: ConjugateDeps = {
    store: h.store,
    llm: async (prompt, schema, model, maxTokens) => { calls.llm.push({ prompt, schema, model, maxTokens }); return await answer(); },
    model: MODEL,
    translitRules: () => "\n[TRANSLIT]",
    now: () => h.now(),
    sleep: () => new Promise((r) => setTimeout(r, 5)),
    log: (m) => calls.logs.push(m),
    leaseSeconds: 60, waitMs: 3_000, pollMs: 5,
  };
  return { deps, calls };
}

const creditError = () => Object.assign(new Error("Your credit balance is too low"), { kind: "credit" });

// ---------------------------------------------------------------- scenarios

const scenarios: Record<string, (h: Harness) => Promise<void>> = {
  "a new verb: one call, stored; then served from the table with no call": async (h) => {
    const { deps, calls } = fakes(h);
    const first = await getConjugations(deps, VERB);
    assertEquals(first.status, "ready");
    assert(first.status === "ready" && !first.cached && first.entry.conjugations.past["2ms"].he === "הִנַּחְתָּ");
    const second = await getConjugations(deps, VERB);
    assert(second.status === "ready" && second.cached);
    assertEquals(calls.llm.length, 1);
    const row = await h.store.get("hebrew", KEY);
    assertEquals([row?.status, row?.lemma_meaning, row?.lock_token], ["ready", "to put", null]);
  },

  "the call uses the quality model, the conjugation schema and names the verb": async (h) => {
    const { deps, calls } = fakes(h);
    await getConjugations(deps, VERB);
    const c = calls.llm[0];
    assertEquals([c.model, c.maxTokens], [MODEL, MAX_TOKENS]);
    assert(c.schema === CONJUGATION_SCHEMA && c.prompt.includes(VERB.lemma) && c.prompt.includes("hifil") && c.prompt.includes("[TRANSLIT]"));
  },

  "five students at once: one AI call, all five get the table": async (h) => {
    const { deps, calls } = fakes(h, () => new Promise((r) => setTimeout(() => r(fullTable()), 80)));
    const out = await Promise.all(Array.from({ length: 5 }, () => getConjugations(deps, VERB)));
    assertEquals(calls.llm.length, 1);
    assertEquals(out.map((o) => o.status), ["ready", "ready", "ready", "ready", "ready"]);
    assertEquals(out.filter((o) => o.status === "ready" && !o.cached).length, 1);
  },

  "a model error gives the verb back; after the last attempt nobody pays again": async (h) => {
    const { deps, calls } = fakes(h, () => { throw new Error("overloaded_error"); });
    assertEquals((await getConjugations(deps, VERB)).status, "failed");
    assertEquals((await h.store.get("hebrew", KEY))?.attempts, 1);
    assertEquals((await getConjugations(deps, VERB)).status, "failed");
    const third = await getConjugations(deps, VERB);
    assertEquals(third.status, "failed");
    assertEquals(calls.llm.length, 2);
  },

  "an account error (no credit) does not use up the verb's attempts": async (h) => {
    const { deps, calls } = fakes(h, () => { throw creditError(); });
    for (let i = 0; i < 3; i++) assertEquals((await getConjugations(deps, VERB)).status, "failed");
    assertEquals(calls.llm.length, 3);
    assertEquals((await h.store.get("hebrew", KEY))?.attempts, 0);
  },

  "an incomplete table is not stored for everyone": async (h) => {
    const { deps } = fakes(h, () => ({ conjugations: { past: fullTable().conjugations.past } }));
    assertEquals((await getConjugations(deps, VERB)).status, "failed");
    const row = await h.store.get("hebrew", KEY);
    assertEquals([row?.status, row?.conjugations], ["failed", null]);
  },

  "a holder whose lease ran out cannot overwrite the table made by the next one": async (h) => {
    let release!: (v: any) => void;
    const slow = fakes(h, () => new Promise((r) => { release = r; }));
    slow.deps.leaseSeconds = h.lease;
    const pending = getConjugations(slow.deps, VERB);
    while (!release) await new Promise((r) => setTimeout(r, 5));
    await h.expire();
    const fast = fakes(h, () => {
      const t = fullTable();
      t.conjugations.past["2ms"].he = "הֵנַחְתָּ"; // a different (made) answer
      return t;
    });
    const second = await getConjugations(fast.deps, VERB);
    assert(second.status === "ready" && !second.cached);
    release(fullTable());
    const first = await pending;
    assert(first.status === "ready" && first.cached && first.entry.conjugations.past["2ms"].he === "הֵנַחְתָּ");
    assertEquals((await h.store.get("hebrew", KEY))?.conjugations.past["2ms"].he, "הֵנַחְתָּ");
  },

  "request: only verbs on the caller's own cards may cost a call": async (h) => {
    const { deps, calls } = fakes(h);
    const notMine = { admin: false, email: "b@x.com", ownsVerb: async () => false };
    const mine = { admin: false, email: "a@x.com", ownsVerb: async (l: string, k: string) => l === "hebrew" && k === KEY };
    const admin = { admin: true, email: "adm@x.com", ownsVerb: async () => false };
    assertEquals((await handleConjugationRequest(deps, notMine, VERB)).status, 403);
    assertEquals([calls.llm.length, await h.store.get("hebrew", KEY)], [0, null]);
    assertEquals((await handleConjugationRequest(deps, mine, VERB)).status, 200);
    assertEquals((await handleConjugationRequest(deps, admin, { ...VERB, lemma: "לֶאֱכֹל", binyan: "paal" })).status, 200);
    assertEquals(calls.llm.length, 2);
  },

  "the last attempt's holder died: the answer is 'failed', not 'pending' forever, and no call": async (h) => {
    const { deps, calls } = fakes(h);
    await h.store.claim("hebrew", KEY, VERB.lemma, h.lease, 2);
    await h.expire();
    await h.store.claim("hebrew", KEY, VERB.lemma, h.lease, 2);
    await h.expire();
    const out = await getConjugations(deps, VERB);
    assertEquals([out.status, calls.llm.length], ["failed", 0]);
  },

  "a student may start only a few NEW verbs a day; made tables are always served": async (h) => {
    const { deps, calls } = fakes(h);
    deps.dailyNewLimit = 2;
    const a = { admin: false, email: "a@x.com", ownsVerb: async () => true };
    const verb = (lemma: string) => ({ ...VERB, lemma, binyan: "paal" });
    assertEquals((await handleConjugationRequest(deps, a, verb("לִכְתֹּב"))).status, 200);
    assertEquals((await handleConjugationRequest(deps, a, verb("לִקְרֹא"))).status, 200);
    const third = await handleConjugationRequest(deps, a, verb("לִשְׁמֹר"));
    assertEquals([third.status, third.body.status, calls.llm.length], [429, "limited", 2]);
    // Already made: served even over the limit, no call.
    assertEquals((await handleConjugationRequest(deps, a, verb("לִכְתֹּב"))).body.cached, true);
    // Another student, and admins, are not affected.
    assertEquals((await handleConjugationRequest(deps, { ...a, email: "b@x.com" }, verb("לִשְׁמֹר"))).status, 200);
    assertEquals((await handleConjugationRequest(deps, { admin: true, email: "adm@x.com", ownsVerb: async () => false }, verb("לִלְמֹד"))).status, 200);
    assertEquals(calls.llm.length, 4);
    // Then a@x.com gets the one b@x.com made, without a call.
    assertEquals((await handleConjugationRequest(deps, a, verb("לִשְׁמֹר"))).body.cached, true);
    assertEquals(calls.llm.length, 4);
  },

  "the lease outlasts an edge function run (400 s), so a slow answer is never paid twice": async () => {
    assert(LEASE_SECONDS >= 400);
  },

  "request: the card's own key (full spelling) is used when it is the same verb's letters": async (h) => {
    const { deps, calls } = fakes(h);
    const seen: string[] = [];
    const owner = { admin: false, email: "a@x.com", ownsVerb: async (_l: string, k: string) => { seen.push(k); return true; } };
    const love = { language: "hebrew", lemma: "לֶאֱהֹב", binyan: "paal", lemma_meaning: "to love" };
    assertEquals((await handleConjugationRequest(deps, owner, { ...love, lemma_key: "לאהוב|paal" })).status, 200);
    assertEquals((await handleConjugationRequest(deps, owner, { ...love, lemma: "לֶאֱהוֹב", lemma_key: "לאהוב|paal" })).body.cached, true);
    // Another verb's key, or another binyan: ignored, the lemma's own key is used.
    await handleConjugationRequest(deps, owner, { ...love, lemma_key: "לכתוב|paal" });
    await handleConjugationRequest(deps, owner, { ...love, lemma_key: "לאהוב|piel" });
    assertEquals(seen, ["לאהוב|paal", "לאהוב|paal", lemmaKey("לֶאֱהֹב", "paal"), lemmaKey("לֶאֱהֹב", "paal")]);
    assertEquals(calls.llm.length, 2);
  },

  "request: bad input is refused before anything else": async (h) => {
    const { deps, calls } = fakes(h);
    const anyone = { admin: true, email: "adm@x.com", ownsVerb: async () => true };
    for (const body of [{}, { lemma: "" }, { lemma: "lehaniach" }, { ...VERB, language: "spanish" }, { ...VERB, lemma: "<script>" }, null]) {
      assertEquals((await handleConjugationRequest(deps, anyone, body)).status, 400);
    }
    assertEquals(calls.llm.length, 0);
  },
};

// ---------------------------------------------------------------- runners

for (const [name, fn] of Object.entries(scenarios)) {
  Deno.test(`memory · ${name}`, () => fn(memoryHarness()));
}

const url = Deno.env.get("TEST_DATABASE_URL");
for (const [name, fn] of Object.entries(scenarios)) {
  Deno.test({
    name: `postgres · ${name}`,
    ignore: !url,
    sanitizeResources: false,
    sanitizeOps: false,
    fn: async () => {
      const sql = postgres(url!, { max: 8, onnotice: () => {} });
      try {
        await sql`truncate verb_lexicon`;
        await fn(sqlHarness(sql));
      } finally {
        await sql.end();
      }
    },
  });
}
