// Access to verb_lexicon (migration 2200). The logic only talks to this
// interface: SupabaseLexiconStore calls the SQL functions (leases checked in
// the database); MemoryLexiconStore keeps the same rules in memory (tests).

export interface LexiconRow {
  language: string;
  lemma_key: string;
  lemma: string | null;
  lemma_phonetic: string | null;
  lemma_meaning: string | null;
  binyan: string | null;
  root: string | null;
  conjugations: any;
  status: "pending" | "ready" | "failed";
  attempts: number;
  lock_token: string | null;
  locked_until: string | null;
  requested_by?: string | null;
  created_at?: string;
}

/** The student already started their daily share of new verbs. */
export class DailyLimitError extends Error {
  constructor() {
    super("daily limit of new verbs reached");
    this.name = "DailyLimitError";
  }
}

export type LexiconPatch = {
  lemma: string;
  lemma_phonetic?: string;
  lemma_meaning?: string;
  binyan?: string;
  root?: string;
  conjugations: Record<string, unknown>;
  model: string;
  prompt_version: string;
};

export interface LexiconStore {
  get(language: string, lemmaKey: string): Promise<LexiconRow | null>;
  /**
   * The verb for this caller (with lock_token) — or null: someone holds it,
   * it is done, or it failed too often. Throws DailyLimitError for a NEW verb
   * when `requestedBy` already started `dailyNewLimit` new verbs in 24 h.
   */
  claim(language: string, lemmaKey: string, lemma: string, leaseSeconds: number, maxAttempts: number,
    requestedBy?: string | null, dailyNewLimit?: number | null): Promise<LexiconRow | null>;
  /** false when the lease was lost or the table already exists. */
  save(language: string, lemmaKey: string, token: string, patch: LexiconPatch): Promise<boolean>;
  fail(language: string, lemmaKey: string, token: string, error: string, refund: boolean): Promise<boolean>;
}

export class SupabaseLexiconStore implements LexiconStore {
  constructor(private db: any) {}
  async get(language: string, lemmaKey: string) {
    const { data, error } = await this.db.from("verb_lexicon").select("*").eq("language", language).eq("lemma_key", lemmaKey).limit(1);
    if (error) throw error;
    return (data?.[0] as LexiconRow) || null;
  }
  async claim(language: string, lemmaKey: string, lemma: string, leaseSeconds: number, maxAttempts: number,
    requestedBy: string | null = null, dailyNewLimit: number | null = null) {
    const { data, error } = await this.db.rpc("verb_lexicon_claim", {
      p_language: language, p_lemma_key: lemmaKey, p_lemma: lemma, p_lease_seconds: leaseSeconds, p_max_attempts: maxAttempts,
      p_requested_by: requestedBy, p_daily_new_limit: dailyNewLimit,
    });
    if (error) {
      if (/daily limit/i.test(error.message || "")) throw new DailyLimitError();
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return row?.lock_token ? (row as LexiconRow) : null;
  }
  async save(language: string, lemmaKey: string, token: string, patch: LexiconPatch) {
    const { data, error } = await this.db.rpc("verb_lexicon_save", { p_language: language, p_lemma_key: lemmaKey, p_token: token, p_patch: patch });
    if (error) throw error;
    return data === true;
  }
  async fail(language: string, lemmaKey: string, token: string, err: string, refund: boolean) {
    const { data, error } = await this.db.rpc("verb_lexicon_fail", { p_language: language, p_lemma_key: lemmaKey, p_token: token, p_error: err, p_refund: refund });
    if (error) throw error;
    return data === true;
  }
}

/** Same rules as the SQL functions, in memory. `now` is injectable for lease tests. */
export class MemoryLexiconStore implements LexiconStore {
  rows = new Map<string, LexiconRow>();
  constructor(private now: () => number = () => Date.now()) {}
  private k(language: string, lemmaKey: string) { return `${language}|${lemmaKey}`; }
  async get(language: string, lemmaKey: string) {
    const r = this.rows.get(this.k(language, lemmaKey));
    return r ? { ...r } : null;
  }
  async claim(language: string, lemmaKey: string, lemma: string, leaseSeconds: number, maxAttempts: number,
    requestedBy: string | null = null, dailyNewLimit: number | null = null) {
    const lease = Math.min(Math.max(leaseSeconds || 400, 1), 600) * 1000;
    const until = new Date(this.now() + lease).toISOString();
    const token = crypto.randomUUID();
    const r = this.rows.get(this.k(language, lemmaKey));
    if (!r && requestedBy != null && dailyNewLimit != null) {
      const since = this.now() - 86_400_000;
      const started = [...this.rows.values()].filter((x) => x.requested_by === requestedBy && Date.parse(x.created_at || "") > since).length;
      if (started >= dailyNewLimit) throw new DailyLimitError();
    }
    if (!r) {
      const row: LexiconRow = {
        language, lemma_key: lemmaKey, lemma, lemma_phonetic: null, lemma_meaning: null, binyan: null, root: null,
        conjugations: null, status: "pending", attempts: 1, lock_token: token, locked_until: until,
        requested_by: requestedBy, created_at: new Date(this.now()).toISOString(),
      };
      this.rows.set(this.k(language, lemmaKey), row);
      return { ...row };
    }
    const free = !r.locked_until || Date.parse(r.locked_until) < this.now();
    if (r.conjugations != null || !free || r.attempts >= Math.max(maxAttempts || 2, 1)) return null;
    Object.assign(r, { lock_token: token, locked_until: until, attempts: r.attempts + 1, status: "pending" });
    return { ...r };
  }
  async save(language: string, lemmaKey: string, token: string, patch: LexiconPatch) {
    const r = this.rows.get(this.k(language, lemmaKey));
    if (!r || r.lock_token !== token || !r.locked_until || Date.parse(r.locked_until) <= this.now() || r.conjugations != null) return false;
    Object.assign(r, {
      lemma: patch.lemma || r.lemma, lemma_phonetic: patch.lemma_phonetic || null, lemma_meaning: patch.lemma_meaning || null,
      binyan: patch.binyan || null, root: patch.root || null, conjugations: patch.conjugations,
      status: "ready", lock_token: null, locked_until: null,
    });
    return true;
  }
  async fail(language: string, lemmaKey: string, token: string, _error: string, refund: boolean) {
    const r = this.rows.get(this.k(language, lemmaKey));
    if (!r || r.lock_token !== token || r.conjugations != null) return false;
    Object.assign(r, { status: "failed", lock_token: null, locked_until: null, attempts: refund ? Math.max(r.attempts - 1, 0) : r.attempts });
    return true;
  }
}
