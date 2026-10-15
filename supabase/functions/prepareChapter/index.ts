// prepareChapter — makes a video's chapter sentences (Sentence discovery) on
// the server, right when the video is added in Media, so no student waits on
// "Preparing the sentences…". The steps live in ./pipeline.ts: each one's
// result is kept in chapter_prep (migration 2100) and reused on a retry, and
// one run at a time holds the video.
//
// Who may ask: admins (any video, and rebuilds); other users only for a video
// in their own school's catalog or their own saved videos (./access.ts).
//
// Request: { videoId, language: "hebrew", force?: boolean }
//   force: rebuild and replace the published chapter (e.g. after importing
//   lyrics); cached steps whose inputs did not change are still reused.
//   Admins only. Other users may only start the first preparation of a video
//   in the shared library or in their own saved videos (./access.ts).
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
import { inSchoolCatalog, isAdmin, prepAccess, stoppedForUsers, type Caller } from "./access.ts";

function liveDeps(db: any, store: PrepStore): PrepDeps {
  return {
    store,
    // Imported lyrics shape the chapter every student shares, so only the
    // school catalogs' (curated by admins) count — never a student's own
    // saved copy, whose text could be wrong.
    async loadSavedTranscript(videoId) {
      const { data } = await db.from("media_library").select("processed_transcript").eq("video_id", videoId);
      const row = (data || []).find((r: any) => Array.isArray(r?.processed_transcript) && r.processed_transcript.length);
      return row ? row.processed_transcript : [];
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
  let caller: Caller = { kind: "internal" };
  let email = "";
  let userId = "";
  if (!internal) {
    const auth = await requireUser(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    caller = { kind: "user", role: String((auth.user.app_metadata as any)?.user_role || "user") };
    email = String(auth.user.email || "");
    userId = String(auth.user.id || "");
  }

  const body = await req.json().catch(() => ({}));
  const videoId = String(body?.videoId || "").trim();
  const language = String(body?.language || "hebrew").toLowerCase();
  const force = body?.force === true;
  const continuing = internal && body?.continuing === true;
  const db = serviceClient();

  // Testing: run the pipeline in memory and return the result without saving
  // anything (no chapter_prep, no chapter_content). It still PAYS for the
  // transcription and Claude, so it is refused unless called with the service
  // role key and an explicit confirmation — never from the app.
  if (body?.dryRun === true) {
    if (!internal || body?.confirmPaidCalls !== true) {
      return json({ error: "dryRun makes paid calls: service role key and confirmPaidCalls: true required" }, 403);
    }
    const out = await runPrep(liveDeps(db, new MemoryPrepStore()), { videoId, language, force: false, continuing: false, ignoreLyrics: body?.ignoreLyrics === true });
    return json(out, "sentences" in out ? 200 : 500);
  }
  if (!/^[\w-]{6,20}$/.test(videoId)) return json({ error: "Provide a YouTube videoId" }, 400);

  // Rebuilds are admin-only; others may only start the first preparation of
  // a video in the shared library or in their own saved videos (./access.ts).
  const access = isAdmin(caller)
    ? prepAccess({ caller, force })
    : prepAccess({
        caller, force,
        // Only the catalog of the caller's own school(s) counts.
        inSharedLibrary: inSchoolCatalog(
          ((await db.from("media_library").select("org_id").eq("video_id", videoId)).data || []).map((r: any) => r.org_id ?? null),
          userId ? ((await db.from("memberships").select("org_id").eq("user_id", userId)).data || []).map((r: any) => String(r.org_id)) : [],
        ),
        inOwnLibrary: !!email && !!(await db.from("user_saved_video").select("video_id").eq("video_id", videoId)
          .ilike("created_by", email.replace(/[\\%_]/g, "\\$&")).limit(1)).data?.length,
      });
  if (!access.ok) return json({ error: access.error }, access.status);

  if (!force && !continuing) {
    const { data } = await db.from("chapter_content").select("video_id").eq("video_id", videoId).limit(1);
    if (data?.length) return json({ status: "ready" });
  }
  // A preparation that stopped for good is restarted only by an admin: a
  // student's (or an old tab's) request would only pay again.
  if (!isAdmin(caller) && !continuing) {
    const { data } = await db.from("chapter_prep").select("status, attempts, error_kind, locked_until").eq("video_id", videoId).limit(1);
    if (stoppedForUsers(data?.[0] || null, Date.now())) return json({ status: "stopped" }, 409);
  }

  const input: PrepInput = { videoId, language, force, continuing };
  const work = runPrep(liveDeps(db, new SupabasePrepStore(db)), input)
    .then((out) => (out.status === "continue" ? continueInNewRun(input) : undefined))
    .catch((e) => console.error(`[prepareChapter ${videoId}] failed`, e));
  // Keep working after the reply (Supabase background task).
  (globalThis as any).EdgeRuntime?.waitUntil?.(work);
  return json({ status: "started" }, 202);
});
