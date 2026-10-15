// Access to chapter_prep (migration 2100). The pipeline only talks to this
// interface: SupabasePrepStore calls the SQL functions (leases checked in the
// database); MemoryPrepStore keeps everything in memory (dryRun, unit tests).

export interface PrepRow {
  video_id: string;
  language: string;
  status: string;
  audio_key: string | null;
  transcript: any;
  captions: any;
  segment_key: string | null;
  sentences: any[] | null;
  translate_key: string | null;
  batch_size: number | null;
  batches: Record<string, any>;
  attempts: number;
  hops: number;
  lock_token: string;
}

export type FinalStatus = "queued" | "failed" | "blocked" | "pending_recovery";

export class LeaseLostError extends Error {
  constructor(videoId: string) {
    super(`lease lost for ${videoId}`);
    this.name = "LeaseLostError";
  }
}

export interface PrepStore {
  /** The video for this run, with its cached results — or null when another run holds it. */
  claim(videoId: string, language: string, leaseSeconds: number, continuing: boolean): Promise<PrepRow | null>;
  /** Stores a step's results and renews the lease; false when the lease is lost. */
  save(videoId: string, token: string, patch: Record<string, unknown>, leaseSeconds: number): Promise<boolean>;
  /** Keeps one finished batch; false for a lost lease or an outdated translate_key. */
  addBatch(videoId: string, token: string, translateKey: string, index: number, batch: unknown, leaseSeconds: number): Promise<boolean>;
  /** Publishes in chapter_content (complete chapters only). Throws LeaseLostError. */
  publish(videoId: string, token: string, sentences: any[], source: string, force: boolean): Promise<"published" | "kept_existing">;
  release(videoId: string, token: string, status: FinalStatus, errorKind?: string | null, lastError?: string | null, recoveryReason?: string | null): Promise<boolean>;
}

export class SupabasePrepStore implements PrepStore {
  constructor(private db: any) {}

  private async rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await this.db.rpc(name, args);
    if (error) {
      if (/lease lost/i.test(error.message || "")) throw new LeaseLostError(String(args.p_video_id));
      throw new Error(`${name}: ${error.message}`);
    }
    return data;
  }

  async claim(videoId: string, language: string, leaseSeconds: number, continuing: boolean) {
    const rows = await this.rpc("chapter_prep_claim", { p_video_id: videoId, p_language: language, p_lease_seconds: leaseSeconds, p_continuing: continuing });
    return (Array.isArray(rows) ? rows[0] : rows) || null;
  }
  async save(videoId: string, token: string, patch: Record<string, unknown>, leaseSeconds: number) {
    return (await this.rpc("chapter_prep_save", { p_video_id: videoId, p_token: token, p_patch: patch, p_lease_seconds: leaseSeconds })) === true;
  }
  async addBatch(videoId: string, token: string, translateKey: string, index: number, batch: unknown, leaseSeconds: number) {
    return (await this.rpc("chapter_prep_add_batch", { p_video_id: videoId, p_token: token, p_translate_key: translateKey, p_index: index, p_batch: batch, p_lease_seconds: leaseSeconds })) === true;
  }
  async publish(videoId: string, token: string, sentences: any[], source: string, force: boolean) {
    return await this.rpc("chapter_prep_publish", { p_video_id: videoId, p_token: token, p_sentences: sentences, p_source: source, p_force: force });
  }
  async release(videoId: string, token: string, status: FinalStatus, errorKind: string | null = null, lastError: string | null = null, recoveryReason: string | null = null) {
    return (await this.rpc("chapter_prep_release", { p_video_id: videoId, p_token: token, p_status: status, p_error_kind: errorKind, p_last_error: lastError, p_recovery_reason: recoveryReason })) === true;
  }
}

/** Same rules as the SQL functions, in memory, for one process. */
export class MemoryPrepStore implements PrepStore {
  rows = new Map<string, PrepRow & { locked_until: number | null; recovery_reason?: string | null; error_kind?: string | null; last_error?: string | null }>();
  published = new Map<string, { sentences: any[]; source: string }>();
  constructor(private now: () => number = Date.now) {}

  private held(videoId: string, token: string) {
    const r = this.rows.get(videoId);
    return r && r.lock_token === token && r.locked_until !== null && r.locked_until > this.now() ? r : null;
  }
  async claim(videoId: string, language: string, leaseSeconds: number, continuing: boolean) {
    let r = this.rows.get(videoId);
    if (r && r.locked_until !== null && r.locked_until > this.now()) return null;
    if (!r) {
      r = { video_id: videoId, language, status: "queued", audio_key: null, transcript: null, captions: null, segment_key: null, sentences: null, translate_key: null, batch_size: null, batches: {}, attempts: 0, hops: 0, lock_token: "", locked_until: null };
      this.rows.set(videoId, r);
      continuing = false;
    }
    r.language = language;
    r.lock_token = crypto.randomUUID();
    r.locked_until = this.now() + leaseSeconds * 1000;
    if (continuing) r.hops += 1; else { r.attempts += 1; r.hops = 0; }
    return structuredClone(r);
  }
  async save(videoId: string, token: string, patch: Record<string, unknown>, leaseSeconds: number) {
    const r = this.held(videoId, token);
    if (!r) return false;
    if (patch.status === "ready") throw new Error("ready is set only by publish");
    Object.assign(r, structuredClone(patch));
    if ("batches" in patch && !patch.batches) r.batches = {};
    r.locked_until = this.now() + leaseSeconds * 1000;
    return true;
  }
  async addBatch(videoId: string, token: string, translateKey: string, index: number, batch: unknown, leaseSeconds: number) {
    const r = this.held(videoId, token);
    if (!r || r.translate_key !== translateKey) return false;
    r.batches = { ...r.batches, [String(index)]: structuredClone(batch) };
    r.locked_until = this.now() + leaseSeconds * 1000;
    return true;
  }
  async publish(videoId: string, token: string, sentences: any[], source: string, force: boolean) {
    const r = this.held(videoId, token);
    if (!r) throw new LeaseLostError(videoId);
    if (!sentences.length) throw new Error("no sentences");
    const missing = sentences.filter((s) => !String(s?.transliteration || "").trim() || !String(s?.english || "").trim()).length;
    if (missing) throw new Error(`${missing} of ${sentences.length} sentences untranslated`);
    const exists = this.published.has(videoId);
    if (!exists || force) this.published.set(videoId, { sentences: structuredClone(sentences), source });
    Object.assign(r, { status: "ready", lock_token: "", locked_until: null });
    return exists && !force ? "kept_existing" : "published";
  }
  async release(videoId: string, token: string, status: FinalStatus, errorKind: string | null = null, lastError: string | null = null, recoveryReason: string | null = null) {
    const r = this.rows.get(videoId);
    if (!r || r.lock_token !== token) return false;
    Object.assign(r, { status, error_kind: errorKind, last_error: lastError, recovery_reason: recoveryReason, lock_token: "", locked_until: null });
    return true;
  }
}
