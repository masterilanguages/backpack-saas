// prepareChapter — makes a video's chapter sentences (Sentence discovery) on
// the server, right when the video is added in Media, so no student waits on
// "Preparing the sentences…". The steps live in ./pipeline.ts: each one's
// result is kept in chapter_prep (migration 2100) and reused on a retry, and
// one run at a time holds the video.
//
// Request: { videoId, language: "hebrew", force?: boolean }
//   force: rebuild and replace the published chapter (e.g. after importing
//   lyrics); cached steps whose inputs did not change are still reused.
// Replies at once ({ status: "ready" | "started" }) and works in the
// background; the app sees the result when the chapter_content row appears.
// Internal: { …, continuing: true } with the service role key — a run that
// left translation to a new run (see pipeline.ts).
import { handleCors, json } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/auth.ts";
import { transcribeMediaSource } from "../_shared/transcription/index.ts";
import { fetchYoutubeCaptions } from "../_shared/transcription/supadata.ts";
import { askJsonQuality } from "../_shared/llm.ts";
import { runPrep, type PrepDeps, type PrepInput } from "./pipeline.ts";
import { MemoryPrepStore, SupabasePrepStore, type PrepStore } from "./store.ts";

function liveDeps(db: any, store: PrepStore): PrepDeps {
  return {
    store,
    async loadSavedTranscript(videoId) {
      for (const table of ["media_library", "user_saved_video"]) {
        const { data } = await db.from(table).select("processed_transcript").eq("video_id", videoId).limit(1);
        if (Array.isArray(data?.[0]?.processed_transcript) && data[0].processed_transcript.length) return data[0].processed_transcript;
      }
      return [];
    },
    async transcribe(videoId, code) {
      const res = await transcribeMediaSource({ kind: "youtube", videoId }, { language: code });
      return { transcript: res?.transcript || [], words: res?.words, source: res?.source || "", error: res?.error };
    },
    fetchCaptions: (videoId, code) => fetchYoutubeCaptions(videoId, code),
    translate: (prompt, schema, model, maxTokens) => askJsonQuality(prompt, schema, model, maxTokens),
    now: () => Date.now(),
    log: (m) => console.log(m),
  };
}

// The next run of a job that ran out of time, as a new invocation.
function continueInNewRun(input: PrepInput) {
  return fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/prepareChapter`, {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ videoId: input.videoId, language: input.language, force: input.force, continuing: true }),
  }).then((r) => r.body?.cancel()).catch((e) => console.error(`[prepareChapter ${input.videoId}] could not continue`, e));
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  const bearer = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
  const internal = !!bearer && bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!internal) {
    const auth = await requireUser(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
  }

  const body = await req.json().catch(() => ({}));
  const videoId = String(body?.videoId || "").trim();
  const language = String(body?.language || "hebrew").toLowerCase();
  const force = body?.force === true;
  const continuing = internal && body?.continuing === true;
  const db = serviceClient();

  // Testing: run the pipeline in memory and return the result without saving
  // anything (no chapter_prep, no chapter_content).
  if (body?.dryRun === true) {
    const out = await runPrep(liveDeps(db, new MemoryPrepStore()), { videoId, language, force: false, continuing: false, ignoreLyrics: body?.ignoreLyrics === true });
    return json(out, "sentences" in out ? 200 : 500);
  }
  if (!/^[\w-]{6,20}$/.test(videoId)) return json({ error: "Provide a YouTube videoId" }, 400);

  if (!force && !continuing) {
    const { data } = await db.from("chapter_content").select("video_id").eq("video_id", videoId).limit(1);
    if (data?.length) return json({ status: "ready" });
  }

  const input: PrepInput = { videoId, language, force, continuing };
  const work = runPrep(liveDeps(db, new SupabasePrepStore(db)), input)
    .then((out) => (out.status === "continue" ? continueInNewRun(input) : undefined))
    .catch((e) => console.error(`[prepareChapter ${videoId}] failed`, e));
  // Keep working after the reply (Supabase background task).
  (globalThis as any).EdgeRuntime?.waitUntil?.(work);
  return json({ status: "started" }, 202);
});
