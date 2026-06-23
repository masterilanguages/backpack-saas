import { supabaseAdmin } from "./supabase";

// ── School ────────────────────────────────────────────────────────────────────

export async function getSchoolBySlug(slug: string) {
  const { data, error } = await supabaseAdmin
    .from("schools")
    .select("*")
    .eq("slug", slug)
    .single();
  if (error) throw error;
  return data;
}

// ── Students ──────────────────────────────────────────────────────────────────

export async function getStudents(schoolId: string) {
  const { data, error } = await supabaseAdmin
    .from("students")
    .select("*")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createStudent(schoolId: string, input: {
  name: string; email?: string; phone?: string; language?: string;
  level?: string; status?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("students")
    .insert({ school_id: schoolId, ...input })
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
    .eq("school_id", schoolId)
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
    .insert({ school_id: schoolId, ...input })
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
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createVocabItem(schoolId: string, input: {
  word: string; translation: string; language: string; deck?: string; notes?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("vocabulary")
    .insert({ school_id: schoolId, ...input })
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
    .eq("school_id", schoolId)
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
    .insert({ school_id: schoolId, ...input })
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
    .eq("school_id", schoolId)
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
    .insert({ school_id: schoolId, ...input })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTask(id: string, input: Partial<{ status: string; priority: string }>) {
  const { error } = await supabaseAdmin.from("tasks").update(input).eq("id", id);
  if (error) throw error;
}

// ── Transactions ──────────────────────────────────────────────────────────────

export async function getTransactions(schoolId: string) {
  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select("*")
    .eq("school_id", schoolId)
    .order("date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ── Team ──────────────────────────────────────────────────────────────────────

export async function getTeamMembers(schoolId: string) {
  const { data, error } = await supabaseAdmin
    .from("team_members")
    .select("*")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ── Notes ─────────────────────────────────────────────────────────────────────

export async function getNotes(schoolId: string) {
  const { data, error } = await supabaseAdmin
    .from("notes")
    .select("*")
    .eq("school_id", schoolId)
    .order("pinned", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export async function getCalendarEvents(schoolId: string) {
  const { data, error } = await supabaseAdmin
    .from("calendar_events")
    .select("*")
    .eq("school_id", schoolId)
    .order("date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
