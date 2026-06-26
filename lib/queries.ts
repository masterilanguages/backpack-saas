import { supabaseAdmin } from "./supabase";

// ── School ────────────────────────────────────────────────────────────────────

export async function getSchoolBySlug(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("slug", slug)
    .single();
  if (error) throw error;
  return data;
}

/** Lightweight existence check for a tenant slug (no throw on miss). */
export async function schoolExistsBySlug(slug: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

// ── Students ──────────────────────────────────────────────────────────────────

export async function getStudents(schoolId: string) {
  const { data, error } = await supabaseAdmin
    .from("students")
    .select("*")
    .eq("org_id", schoolId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Students ENRIQUECIDOS con su progreso real del Learning Portal. Une cada
 * alumno con su user_profile + conteos de palabras/journal, todo por org_id
 * (que 0300 anadio a las tablas de learning) y relacionado por email
 * (= created_by). Asi el admin ve datos reales, no los placeholders.
 */
export async function getStudentsWithProgress(orgId: string) {
  const students = await getStudents(orgId);
  const [profilesRes, wordsRes, journalsRes] = await Promise.all([
    supabaseAdmin
      .from("user_profile")
      .select("created_by, language, current_day, xp, daily_streak, last_active_date")
      .eq("org_id", orgId),
    supabaseAdmin.from("word").select("created_by").eq("org_id", orgId),
    supabaseAdmin.from("journal_entry").select("created_by").eq("org_id", orgId),
  ]);

  const norm = (e?: string | null) => (e ?? "").trim().toLowerCase();
  const profByEmail = new Map<string, any>();
  for (const p of profilesRes.data ?? []) {
    const k = norm(p.created_by);
    if (k) profByEmail.set(k, p);
  }
  const countBy = (rows: Array<{ created_by?: string | null }> | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) {
      const k = norm(r.created_by);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const wordCount = countBy(wordsRes.data as any);
  const journalCount = countBy(journalsRes.data as any);

  return students.map((s: any) => {
    const k = norm(s.email);
    const p = profByEmail.get(k);
    return {
      ...s,
      // el idioma REAL del perfil pisa el placeholder (asi la columna/filtro/busqueda muestran lo real)
      language: p?.language ?? s.language,
      progress: {
        hasProfile: Boolean(p),
        language: p?.language ?? null,
        day: p?.current_day ?? null,
        xp: p?.xp ?? null,
        streak: p?.daily_streak ?? null,
        words: wordCount.get(k) ?? 0,
        journal: journalCount.get(k) ?? 0,
        lastActive: p?.last_active_date ?? null,
      },
    };
  });
}

export async function createStudent(schoolId: string, input: {
  name: string; email?: string; phone?: string; language?: string;
  level?: string; status?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("students")
    .insert({ org_id: schoolId, ...input })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateStudent(id: string, input: Partial<{
  name: string; email: string; phone: string; language: string;
  level: string; status: string;
}>) {
  const { data, error } = await supabaseAdmin
    .from("students")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteStudent(id: string) {
  const { error } = await supabaseAdmin.from("students").delete().eq("id", id);
  if (error) throw error;
}

// ── Leads ─────────────────────────────────────────────────────────────────────

export async function getLeads(schoolId: string) {
  const { data, error } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("org_id", schoolId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createLead(schoolId: string, input: {
  name: string; email?: string; phone?: string; contact?: string;
  source?: string; value?: number; status?: string; owner?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("leads")
    .insert({ org_id: schoolId, ...input })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateLead(id: string, input: Partial<{ status: string; owner: string; value: number }>) {
  const { error } = await supabaseAdmin.from("leads").update(input).eq("id", id);
  if (error) throw error;
}

// ── Vocabulary ────────────────────────────────────────────────────────────────

export async function getVocabulary(schoolId: string) {
  const { data, error } = await supabaseAdmin
    .from("vocabulary")
    .select("*")
    .eq("org_id", schoolId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createVocabItem(schoolId: string, input: {
  word: string; translation: string; language: string; deck?: string; notes?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("vocabulary")
    .insert({ org_id: schoolId, ...input })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Lessons ───────────────────────────────────────────────────────────────────

export async function getLessons(schoolId: string) {
  const { data, error } = await supabaseAdmin
    .from("lessons")
    .select("*")
    .eq("org_id", schoolId)
    .order("date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createLesson(schoolId: string, input: {
  coach?: string; language?: string; date?: string; time?: string;
  topic?: string; status?: string; notes?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("lessons")
    .insert({ org_id: schoolId, ...input })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function getTasks(schoolId: string) {
  const { data, error } = await supabaseAdmin
    .from("tasks")
    .select("*")
    .eq("org_id", schoolId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTask(schoolId: string, input: {
  title: string; assignee?: string; related?: string;
  due_date?: string; priority?: string; status?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("tasks")
    .insert({ org_id: schoolId, ...input })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTask(id: string, input: Partial<{
  title: string; assignee: string; related: string;
  due_date: string; priority: string; status: string;
}>) {
  const { error } = await supabaseAdmin.from("tasks").update(input).eq("id", id);
  if (error) throw error;
}

// ── Transactions ──────────────────────────────────────────────────────────────

export async function getTransactions(schoolId: string) {
  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("org_id", schoolId)
    .order("date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTransaction(schoolId: string, input: {
  description: string; amount: number; type: string;
  category?: string; status?: string; date?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("transactions")
    .insert({ org_id: schoolId, ...input })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Team ──────────────────────────────────────────────────────────────────────

export async function getTeamMembers(schoolId: string) {
  const { data, error } = await supabaseAdmin
    .from("team_members")
    .select("*")
    .eq("org_id", schoolId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function getNotes(schoolId: string) {
  const { data, error } = await supabaseAdmin
    .from("notes")
    .select("*")
    .eq("org_id", schoolId)
    .order("pinned", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function updateNote(id: string, input: Partial<{
  title: string; body: string; author: string; pinned: boolean;
}>) {
  const { data, error } = await supabaseAdmin
    .from("notes")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteNote(id: string) {
  const { error } = await supabaseAdmin.from("notes").delete().eq("id", id);
  if (error) throw error;
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export async function getCalendarEvents(schoolId: string) {
  const { data, error } = await supabaseAdmin
    .from("calendar_events")
    .select("*")
    .eq("org_id", schoolId)
    .order("date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
