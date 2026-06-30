import { supabaseAdmin } from "./supabase";
import { randomUUID } from "crypto";

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
export async function getStudentsWithProgress(orgId: string, coachId?: string | null) {
  const students = await getStudents(orgId);
  const [profilesRes, wordsRes, journalsRes, teamRes] = await Promise.all([
    supabaseAdmin
      .from("user_profile")
      .select("created_by, language, current_day, xp, daily_streak, last_active_date")
      .eq("org_id", orgId),
    supabaseAdmin.from("word").select("created_by").eq("org_id", orgId),
    supabaseAdmin.from("journal_entry").select("created_by").eq("org_id", orgId),
    supabaseAdmin.from("team_members").select("id, name").eq("org_id", orgId),
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
  const coachNameById = new Map<string, string>();
  for (const t of (teamRes.data as any[]) ?? []) coachNameById.set(t.id, t.name);

  const enriched = students.map((s: any) => {
    const k = norm(s.email);
    const p = profByEmail.get(k);
    const assignedCoachId = (s.meta as any)?.coach_id ?? null;
    return {
      ...s,
      // coach asignado (vive en meta.coach_id); resolvemos su nombre para mostrar
      coach_id: assignedCoachId,
      coach: assignedCoachId ? coachNameById.get(assignedCoachId) ?? null : null,
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

  // Si es un coach, solo SUS alumnos asignados.
  return coachId ? enriched.filter((s) => s.coach_id === coachId) : enriched;
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
  level: string; status: string; coach_id: string | null;
}>) {
  const { coach_id, ...rest } = input as any;
  const patch: any = { ...rest };
  // La asignacion de coach vive en meta.coach_id (sin DDL). Merge para no pisar
  // otras claves de meta si las hubiera.
  if (coach_id !== undefined) {
    const { data: cur } = await supabaseAdmin.from("students").select("meta").eq("id", id).single();
    patch.meta = { ...((cur?.meta as object) ?? {}), coach_id: coach_id || null };
  }
  const { data, error } = await supabaseAdmin
    .from("students")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Resuelve el id del team_member (coach) a partir del email con que inicia sesión. */
export async function getCoachIdByEmail(orgId: string, email: string): Promise<string | null> {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return null;
  const { data } = await supabaseAdmin
    .from("team_members")
    .select("id, email")
    .eq("org_id", orgId);
  const m = (data as any[] ?? []).find((t) => (t.email ?? "").trim().toLowerCase() === e);
  return m?.id ?? null;
}

// ── Notas de coaching por alumno (en students.meta.coach_notes, sin DDL) ───────
export interface CoachNote { id: string; text: string; author: string; at: string; }

/** El coach asignado del alumno (para validar permiso). */
export async function getStudentCoachId(studentId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("students").select("meta").eq("id", studentId).single();
  return ((data?.meta as any)?.coach_id) ?? null;
}

export async function addCoachNote(
  studentId: string,
  input: { text: string; author: string },
): Promise<CoachNote> {
  const { data: cur } = await supabaseAdmin.from("students").select("meta").eq("id", studentId).single();
  const meta = ((cur?.meta as any) ?? {}) as Record<string, any>;
  const note: CoachNote = {
    id: randomUUID(),
    text: input.text,
    author: input.author,
    at: new Date().toISOString(), // sellado por el servidor
  };
  const notes = Array.isArray(meta.coach_notes) ? meta.coach_notes : [];
  const { error } = await supabaseAdmin
    .from("students")
    .update({ meta: { ...meta, coach_notes: [note, ...notes] } })
    .eq("id", studentId);
  if (error) throw error;
  return note;
}

export async function deleteCoachNote(studentId: string, noteId: string) {
  const { data: cur } = await supabaseAdmin.from("students").select("meta").eq("id", studentId).single();
  const meta = ((cur?.meta as any) ?? {}) as Record<string, any>;
  const notes = (Array.isArray(meta.coach_notes) ? meta.coach_notes : []).filter(
    (n: any) => n.id !== noteId,
  );
  const { error } = await supabaseAdmin
    .from("students")
    .update({ meta: { ...meta, coach_notes: notes } })
    .eq("id", studentId);
  if (error) throw error;
}

export async function deleteStudent(id: string) {
  const { error } = await supabaseAdmin.from("students").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Detalle completo de UN alumno: su registro + perfil del learning + sus
 * palabras + su journal (relacionado por email = created_by, case-insensitive).
 */
export async function getStudentDetail(orgId: string, studentId: string) {
  const { data: student, error } = await supabaseAdmin
    .from("students")
    .select("*")
    .eq("id", studentId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!student) return null;

  const email = (student.email ?? "").trim();
  if (!email) return { student, profile: null, words: [], journal: [] };

  const [profRes, wordsRes, journalRes] = await Promise.all([
    supabaseAdmin.from("user_profile").select("*").ilike("created_by", email).limit(1),
    supabaseAdmin
      .from("word")
      .select("id, word, translation, language, mastered, is_starred, times_practiced, created_date")
      .ilike("created_by", email)
      .order("created_date", { ascending: false }),
    supabaseAdmin
      .from("journal_entry")
      .select("id, date, text, created_date")
      .ilike("created_by", email)
      .order("created_date", { ascending: false }),
  ]);

  return {
    student,
    profile: (profRes.data ?? [])[0] ?? null,
    words: wordsRes.data ?? [],
    journal: journalRes.data ?? [],
  };
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

export async function updateLead(id: string, input: Partial<{
  name: string; email: string; contact: string; source: string;
  status: string; owner: string; value: number;
}>) {
  const { error } = await supabaseAdmin.from("leads").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteLead(id: string) {
  const { error } = await supabaseAdmin.from("leads").delete().eq("id", id);
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

// ── School words (vocabulario REAL del Learning Portal, agregado por escuela) ───
/**
 * Las palabras que los alumnos de la escuela REALMENTE tienen en el portal
 * (tabla `word`, learning), agregadas por org_id y con el nombre del alumno
 * resuelto por email (created_by). Esto es "los words que tenemos" — distinto
 * del catálogo curado en la tabla `vocabulary`.
 */
export async function getSchoolWords(orgId: string, coachId?: string | null) {
  const norm = (e?: string | null) => (e ?? "").trim().toLowerCase();
  // Algunas traducciones del portal se guardaron como JSON crudo de la IA
  // (p.ej. {"response":"to dance"}); las desenvolvemos para la vista del admin.
  const cleanTranslation = (t: any): string => {
    if (typeof t !== "string") return t ?? "";
    const s = t.trim();
    if (s.startsWith("{") && s.endsWith("}")) {
      try {
        const o = JSON.parse(s);
        return o.response ?? o.translation ?? o.text ?? s;
      } catch {
        return s;
      }
    }
    return s;
  };
  const [wordsRes, students] = await Promise.all([
    supabaseAdmin
      .from("word")
      .select("id, word, translation, language, mastered, is_starred, times_practiced, created_by, created_date")
      .eq("org_id", orgId)
      .order("created_date", { ascending: false }),
    getStudents(orgId),
  ]);
  const nameByEmail = new Map<string, string>();
  for (const s of (students as any[]) ?? []) {
    const k = norm(s.email);
    if (k) nameByEmail.set(k, s.name);
  }
  // Si es un coach: solo las palabras de SUS alumnos asignados (por email).
  let allowedEmails: Set<string> | null = null;
  if (coachId) {
    allowedEmails = new Set(
      (students as any[])
        .filter((s) => (s.meta as any)?.coach_id === coachId)
        .map((s) => norm(s.email))
        .filter(Boolean),
    );
  }
  let rows = (wordsRes.data ?? []).map((w: any) => ({
    ...w,
    translation: cleanTranslation(w.translation),
    student: nameByEmail.get(norm(w.created_by)) ?? w.created_by ?? "—",
    _email: norm(w.created_by),
  }));
  if (allowedEmails) rows = rows.filter((w: any) => allowedEmails!.has(w._email));
  return rows.map(({ _email, ...w }: any) => w);
}

// ── Lessons ───────────────────────────────────────────────────────────────────

export async function getLessons(schoolId: string, coachId?: string | null) {
  const [lessonsRes, students] = await Promise.all([
    supabaseAdmin
      .from("lessons")
      .select("*")
      .eq("org_id", schoolId)
      .order("date", { ascending: false }),
    getStudents(schoolId),
  ]);
  if (lessonsRes.error) throw lessonsRes.error;
  // resolver el nombre del alumno por su FK student_id (relacional)
  const nameById = new Map<string, string>();
  for (const s of (students as any[]) ?? []) nameById.set(s.id, s.name);
  let rows = (lessonsRes.data ?? []).map((l: any) => ({
    ...l,
    student: l.student_id ? nameById.get(l.student_id) ?? "—" : "—",
  }));
  // Si es un coach: solo lecciones de SUS alumnos asignados.
  if (coachId) {
    const allowedIds = new Set(
      (students as any[]).filter((s) => (s.meta as any)?.coach_id === coachId).map((s) => s.id),
    );
    rows = rows.filter((l: any) => l.student_id && allowedIds.has(l.student_id));
  }
  return rows;
}

export async function createLesson(schoolId: string, input: {
  student_id?: string; coach?: string; language?: string; date?: string; time?: string;
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

export async function deleteLesson(id: string) {
  const { error } = await supabaseAdmin.from("lessons").delete().eq("id", id);
  if (error) throw error;
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

export async function createCalendarEvent(schoolId: string, input: {
  title: string; date: string; time?: string; type?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("calendar_events")
    .insert({ org_id: schoolId, ...input })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCalendarEvent(id: string) {
  const { error } = await supabaseAdmin.from("calendar_events").delete().eq("id", id);
  if (error) throw error;
}

// ── Files ─────────────────────────────────────────────────────────────────────
// El binario vive en Supabase Storage (bucket FILES_BUCKET, ruta org_id/...);
// la tabla `files` guarda solo metadatos + storage_path.
export const FILES_BUCKET = "school-files";

export async function getFiles(schoolId: string) {
  const { data, error } = await supabaseAdmin
    .from("files")
    .select("*")
    .eq("org_id", schoolId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createFileRecord(schoolId: string, input: {
  name: string; type?: string; size?: string; storage_path?: string; owner?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("files")
    .insert({ org_id: schoolId, ...input })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFileRecord(id: string) {
  const { error } = await supabaseAdmin.from("files").delete().eq("id", id);
  if (error) throw error;
}
