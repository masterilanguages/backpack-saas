/// <reference lib="deno.ns" />
// The staged prepareChapter flow with fake ElevenLabs / Supadata / Claude:
// no paid calls. Every scenario runs twice — against the in-memory store and,
// when TEST_DATABASE_URL is set (supabase/tests/prepare_pipeline_test.sh),
// against the real SQL functions of migration 2100 in a local PostgreSQL.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import postgres from "npm:postgres@3.4.4";
import { runPrep, CHAPTER_MAX_SECONDS, BATCH_SIZE, MAX_HOPS, type PrepDeps, type Heard } from "./pipeline.ts";
import { LeaseLostError, MemoryPrepStore, type PrepStore, type FinalStatus } from "./store.ts";
import { QUALITY_MODEL, reviewGlossPrompt, glossPrompt } from "../../../lib/chapterPrompts.ts";

// ---------------------------------------------------------------- stores

class SqlPrepStore implements PrepStore {
  constructor(public sql: any) {}
  private async call<T>(q: Promise<T>) {
    try { return await q; } catch (e: any) {
      if (/lease lost/i.test(e?.message || "")) throw new LeaseLostError("?");
      throw e;
    }
  }
  async claim(v: string, lang: string, lease: number, cont: boolean) {
    const rows: any[] = await this.call(this.sql`select * from chapter_prep_claim(${v}, ${lang}, ${lease}, ${cont})`);
    return rows[0] ? { ...rows[0], lock_token: String(rows[0].lock_token) } : null;
  }
  async save(v: string, t: string, patch: Record<string, unknown>, lease: number) {
    const [r]: any[] = await this.call(this.sql`select chapter_prep_save(${v}, ${t}::uuid, ${this.sql.json(patch)}, ${lease}) as ok`);
    return r.ok === true;
  }
  async addBatch(v: string, t: string, k: string, i: number, b: unknown, lease: number) {
    const [r]: any[] = await this.call(this.sql`select chapter_prep_add_batch(${v}, ${t}::uuid, ${k}, ${i}, ${this.sql.json(b)}, ${lease}) as ok`);
    return r.ok === true;
  }
  async publish(v: string, t: string, s: any[], src: string, force: boolean) {
    const [r]: any[] = await this.call(this.sql`select chapter_prep_publish(${v}, ${t}::uuid, ${this.sql.json(s)}, ${src}, ${force}) as out`);
    return r.out;
  }
  async release(v: string, t: string, st: FinalStatus, k: string | null = null, m: string | null = null, rr: string | null = null) {
    const [r]: any[] = await this.call(this.sql`select chapter_prep_release(${v}, ${t}::uuid, ${st}, ${k}, ${m}, ${rr}) as ok`);
    return r.ok === true;
  }
}

interface Harness {
  store: PrepStore;
  prep(v: string): Promise<any>;
  published(v: string): Promise<{ sentences: any[]; source: string } | null>;
  seedPublished(v: string, source: string): Promise<void>;
  /** Make the current holder's lease run out (SQL: wait it out; memory: move the clock). */
  expire(seconds: number): Promise<void>;
  clock: { t: number };
}

function memoryHarness(): Harness {
  const clock = { t: 1_000_000 };
  const store = new MemoryPrepStore(() => clock.t);
  return {
    store, clock,
    prep: async (v) => store.rows.get(v) || null,
    published: async (v) => store.published.get(v) || null,
    seedPublished: async (v, source) => { store.published.set(v, { sentences: [{ text: "old", transliteration: "o", english: "o", start: 0, end: 1 }], source }); },
    expire: async (s) => { clock.t += s * 1000 + 100; },
  };
}

function sqlHarness(sql: any): Harness {
  const store = new SqlPrepStore(sql);
  return {
    store, clock: { t: 1_000_000 },
    prep: async (v) => (await sql`select * from chapter_prep where video_id = ${v}`)[0] || null,
    published: async (v) => (await sql`select sentences, source from chapter_content where video_id = ${v}`)[0] || null,
    seedPublished: async (v, source) => {
      await sql`insert into chapter_content (video_id, language, sentences, source) values (${v}, 'hebrew', ${sql.json([{ text: "old", transliteration: "o", english: "o", start: 0, end: 1 }])}, ${source})`;
    },
    expire: async (s) => { await new Promise((r) => setTimeout(r, s * 1000 + 300)); },
  };
}

// ---------------------------------------------------------------- fakes

// 20 spoken sentences of 3 s, plus one after the 900 s limit (must be dropped).
function fakeHeard(): Heard {
  const transcript = Array.from({ length: 20 }, (_, i) => ({ text: `משפט ${i}.`, start: i * 3, duration: 2.5 }));
  transcript.push({ text: "אחרי הגבול.", start: CHAPTER_MAX_SECONDS + 50, duration: 2 });
  return { transcript, words: [], source: "elevenlabs_scribe" };
}

function fakes(h: Harness, opts: { failWhen?: (prompt: string, call: number) => any; incomplete?: boolean; noGlosses?: boolean; noAudio?: boolean; onTranscribe?: () => Promise<void> } = {}) {
  const calls = { transcribe: 0, captions: 0, translate: [] as { prompt: string; model: string; maxTokens: number }[], logs: [] as string[] };
  let saved: any[] = [];
  const deps: PrepDeps = {
    store: h.store,
    loadSavedTranscript: async () => saved,
    transcribe: async () => {
      calls.transcribe++;
      await opts.onTranscribe?.();
      return opts.noAudio ? { transcript: [], source: "none", error: "ElevenLabs: service unavailable" } : fakeHeard();
    },
    fetchCaptions: async () => { calls.captions++; return []; },
    translate: async (prompt, _schema, model, maxTokens) => {
      calls.translate.push({ prompt, model, maxTokens });
      const fail = opts.failWhen?.(prompt, calls.translate.length);
      if (fail) throw fail;
      const lines = Array.from(prompt.matchAll(/^(\d+): (?:A: )?(.+)$/gm)).map((m) => ({ i: Number(m[1]), text: m[2] }));
      return {
        items: lines.map(({ i, text }) => ({
          i, fixed: text, transliteration: `tr ${text}`,
          english: opts.incomplete && i === 0 ? "" : `en ${text}`,
          words: opts.noGlosses && i === 0 ? [] : text.split(" ").map((w) => ({ w, phonetic: `p-${w}`, meaning: `m-${w}` })),
        })),
      };
    },
    now: () => h.clock.t,
    log: (m) => calls.logs.push(m),
  };
  return { deps, calls, setSaved: (s: any[]) => { saved = s; } };
}

const creditError = () => Object.assign(new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'), { kind: "credit" });
const overloaded = () => Object.assign(new Error("529 overloaded_error"), { status: 529 });
const input = (videoId: string, extra: Record<string, unknown> = {}) => ({ videoId, language: "hebrew", force: false, continuing: false, ...extra });
const batchesOf = (n: number) => Math.ceil(n / BATCH_SIZE);

// ---------------------------------------------------------------- scenarios

const scenarios: Record<string, (h: Harness) => Promise<void>> = {
  async "new video: one transcription, every batch translated, published complete (≤ 900 s)"(h) {
    const { deps, calls } = fakes(h);
    const out = await runPrep(deps, input("v-new"));
    assertEquals(out.status, "published");
    const pub = await h.published("v-new");
    assertEquals(pub!.sentences.length, 20); // the line after 900 s is not prepared
    assert(pub!.sentences.every((s: any) => s.transliteration && s.english && s.words.length && s.end <= CHAPTER_MAX_SECONDS));
    assertEquals([calls.transcribe, calls.captions, calls.translate.length], [1, 1, batchesOf(20)]);
    assertEquals((await h.prep("v-new")).status, "ready");
  },

  async "a sentence back without word glosses: that batch isn't kept, nothing is published (retryable)"(h) {
    const { deps } = fakes(h, { noGlosses: true });
    const out = await runPrep(deps, input("v-nogloss"));
    assertEquals(out.status, "failed");
    assertEquals((out as any).errorKind, "incomplete");
    assertEquals(await h.published("v-nogloss"), null);
    assertEquals((await h.prep("v-nogloss")).status, "failed");
  },

  async "a published run logs how long each stage took"(h) {
    const { deps, calls } = fakes(h);
    await runPrep(deps, input("v-timings"));
    const line = calls.logs.find((m) => m.includes("timings:")) || "";
    for (const stage of ["transcribe", "sentences", "translate", "publish", "total"]) assert(line.includes(stage), line);
  },

  async "ElevenLabs gives no transcript: failed (transcription), nothing translated or published"(h) {
    const { deps, calls } = fakes(h, { noAudio: true });
    const out = await runPrep(deps, input("v-noaudio"));
    assertEquals([out.status, (out as any).errorKind], ["failed", "transcription"]);
    assertEquals([calls.transcribe, calls.translate.length], [1, 0]);
    assertEquals(await h.published("v-noaudio"), null);
    assertEquals((await h.prep("v-noaudio")).status, "failed");
  },

  async "the function dies mid-translation (no clean stop): the next run reuses the transcription and the finished batches"(h) {
    // A killed worker never releases the video: emulate it with a store whose
    // release does nothing, and a batch that never comes back in this run.
    const dying = Object.create(h.store);
    dying.release = async () => true;
    let killed = true;
    const { deps, calls } = fakes(h, { failWhen: (p) => (killed && p.includes("משפט 8.") ? overloaded() : null) });
    await runPrep({ ...deps, store: dying }, input("v-killed", { leaseSeconds: 1 }));
    const left = await h.prep("v-killed");
    assertEquals(left.status, "translating"); // stuck mid-way, as after a crash
    assertEquals(Object.keys(left.batches).sort(), ["0", "2"]);
    await h.expire(1); // its lease runs out
    killed = false;
    const before = calls.translate.length;
    assertEquals((await runPrep(deps, input("v-killed"))).status, "published");
    assertEquals([calls.transcribe, calls.translate.length - before], [1, 1]); // no new transcription, one batch
  },

  async "Claude out of credit: blocked, transcription kept; after the top-up no new transcription"(h) {
    let credit = false;
    const { deps, calls } = fakes(h, { failWhen: () => (credit ? null : creditError()) });
    const out = await runPrep(deps, input("v-credit"));
    assertEquals([out.status, (out as any).errorKind], ["blocked", "credit"]);
    const row = await h.prep("v-credit");
    assertEquals([row.status, row.error_kind, !!row.audio_key, row.sentences.length], ["blocked", "credit", true, 20]);
    assertEquals(await h.published("v-credit"), null);
    credit = true;
    const again = await runPrep(deps, input("v-credit"));
    assertEquals(again.status, "published");
    assertEquals(calls.transcribe, 1);
    assert(calls.logs.some((l) => l.includes("transcript from cache")));
  },

  async "one batch fails (overloaded): the others are kept; the retry translates only that one"(h) {
    let failSecond = true;
    const { deps, calls } = fakes(h, { failWhen: (p) => (failSecond && p.includes("משפט 8.") ? overloaded() : null) });
    const out = await runPrep(deps, input("v-partial"));
    assertEquals([out.status, (out as any).errorKind], ["failed", "overloaded"]);
    assertEquals(Object.keys((await h.prep("v-partial")).batches).sort(), ["0", "2"]);
    const before = calls.translate.length;
    failSecond = false;
    assertEquals((await runPrep(deps, input("v-partial"))).status, "published");
    assertEquals([calls.translate.length - before, calls.transcribe], [1, 1]);
  },

  async "new lyrics + force: no new transcription; sentences and translations redone; published replaced"(h) {
    const { deps, calls, setSaved } = fakes(h);
    assertEquals((await runPrep(deps, input("v-lyrics"))).status, "published");
    const firstTranslate = calls.translate.length;
    setSaved(Array.from({ length: 6 }, (_, i) => ({ text: `שורה ${i}`, lyric: true })));
    const out = await runPrep(deps, input("v-lyrics", { force: true }));
    assertEquals(out.status, "published");
    assertEquals(calls.transcribe, 1);
    assertEquals(calls.translate.length - firstTranslate, batchesOf(6));
    const pub = await h.published("v-lyrics");
    assertEquals([pub!.sentences.length, pub!.source], [6, "elevenlabs_scribe+lyrics"]);
  },

  async "a published chapter is kept without force; replaced only by a complete version with force"(h) {
    await h.seedPublished("v-live", "original");
    const { deps } = fakes(h);
    assertEquals((await runPrep(deps, input("v-live"))).status, "kept_existing");
    assertEquals((await h.published("v-live"))!.source, "original");
    const broken = fakes(h, { incomplete: true });
    const out = await runPrep(broken.deps, input("v-live2", { force: true }));
    assertEquals([out.status, (out as any).errorKind], ["failed", "incomplete"]);
    await h.seedPublished("v-live3", "original");
    const bad = await runPrep(fakes(h, { incomplete: true }).deps, input("v-live3", { force: true }));
    assertEquals(bad.status, "failed");
    assertEquals((await h.published("v-live3"))!.source, "original");
  },

  async "a batch that comes back with gaps is not kept: the retry translates it again"(h) {
    let gaps = true;
    const { deps, calls } = fakes(h, {
      failWhen: () => null,
      get incomplete() { return gaps; },
    } as any);
    const out = await runPrep(deps, input("v-gaps"));
    assertEquals([out.status, (out as any).errorKind], ["failed", "incomplete"]);
    assertEquals(Object.keys((await h.prep("v-gaps")).batches), []); // every batch had a gap (line 0)
    const before = calls.translate.length;
    gaps = false;
    assertEquals((await runPrep(deps, input("v-gaps"))).status, "published");
    assertEquals([calls.translate.length - before, calls.transcribe], [batchesOf(20), 1]);
  },

  async "two runs at the same time: one works, the other is busy; one transcription"(h) {
    const { deps, calls } = fakes(h);
    const [a, b] = await Promise.all([runPrep(deps, input("v-twice")), runPrep(deps, input("v-twice"))]);
    assertEquals([a.status, b.status].sort(), ["busy", "published"]);
    assertEquals(calls.transcribe, 1);
  },

  async "a run whose lease ran out (taken over) cannot write or publish"(h) {
    let other: any = null;
    const { deps } = fakes(h, {
      onTranscribe: async () => {
        await h.expire(1);
        other = await h.store.claim("v-stale", "hebrew", 180, false); // another run takes it over
      },
    });
    const out = await runPrep(deps, input("v-stale", { leaseSeconds: 1 }));
    assertEquals(out.status, "lease_lost");
    assert(other, "the other run got the video");
    const row = await h.prep("v-stale");
    assertEquals([row.audio_key, row.sentences], [null, null]); // nothing from the stale run
    assertEquals(await h.published("v-stale"), null);
  },

  async "a slow transcription leaves translation to a new run; continuations are capped"(h) {
    const { deps, calls } = fakes(h, { onTranscribe: async () => { h.clock.t += 50_000; } });
    assertEquals((await runPrep(deps, input("v-slow"))).status, "continue");
    const row = await h.prep("v-slow");
    assertEquals([row.status, row.sentences.length, calls.translate.length], ["queued", 20, 0]);
    assertEquals((await runPrep(deps, input("v-slow", { continuing: true }))).status, "published");
    assertEquals(calls.transcribe, 1);

    // A job already continued MAX_HOPS times stops as pending_recovery.
    for (let i = 0; i < MAX_HOPS; i++) {
      const r = await h.store.claim("v-hops", "hebrew", 180, i > 0);
      await h.store.release("v-hops", r!.lock_token, "queued");
    }
    const out = await runPrep(deps, input("v-hops", { continuing: true }));
    assertEquals(out.status, "pending_recovery");
    const hops = await h.prep("v-hops");
    assertEquals([hops.status, hops.recovery_reason], ["pending_recovery", `max continuations reached (${MAX_HOPS})`]);
  },

  async "Claude gets the current model and the exact current prompts"(h) {
    const { deps, calls } = fakes(h);
    await runPrep(deps, input("v-prompt"));
    const first = calls.translate.find((c) => c.prompt.includes("0: A: משפט 0."))!;
    const expected = reviewGlossPrompt("Hebrew", Array.from({ length: 8 }, (_, i) => ({ text: `משפט ${i}.`, alt: "" })));
    assertEquals([first.model, first.maxTokens, first.prompt], [QUALITY_MODEL, 12000, expected]);
    // With lyrics: the plain gloss prompt, no review.
    const lyr = fakes(h);
    lyr.setSaved([{ text: "משפט 0.", lyric: true }, { text: "משפט 1.", lyric: true }]);
    assertEquals((await runPrep(lyr.deps, input("v-prompt2"))).status, "published");
    assertEquals([lyr.calls.translate[0].prompt, lyr.calls.translate[0].maxTokens], [glossPrompt("Hebrew", ["משפט 0.", "משפט 1."]), 8000]);
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
      const sql = postgres(url!, { max: 4, onnotice: () => {} });
      try {
        await sql`truncate chapter_prep, chapter_content`;
        await fn(sqlHarness(sql));
      } finally {
        await sql.end();
      }
    },
  });
}
