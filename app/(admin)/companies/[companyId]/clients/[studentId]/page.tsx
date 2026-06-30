"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";

interface Word {
  id: string;
  word: string;
  translation: string;
  language: string;
  mastered: boolean;
  is_starred: boolean;
  times_practiced: number;
  created_date: string;
}
interface Journal { id: string; date: string; text: string; created_date: string; }
interface CoachNote { id: string; text: string; author: string; at: string; }
interface Profile {
  language?: string;
  native_language?: string;
  current_day?: number;
  xp?: number;
  daily_streak?: number;
  last_active_date?: string;
  difficulty_level?: string;
}
interface Detail {
  student: { id: string; name: string; email: string; status: string };
  profile: Profile | null;
  words: Word[];
  journal: Journal[];
  coach_notes?: CoachNote[];
}

function parseTranslation(t?: string): string {
  if (!t) return "—";
  try {
    const o = JSON.parse(t);
    return o.response ?? o.translation ?? o.text ?? t;
  } catch {
    return t;
  }
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-card">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-800">{value != null && value !== "" ? value : "—"}</dd>
    </div>
  );
}

export default function StudentDetailPage() {
  const { companyId, studentId } = useParams<{ companyId: string; studentId: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<CoachNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    fetch(`/api/school/${companyId}/students/${studentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setDetail(d);
        setNotes(d?.coach_notes ?? []);
      })
      .finally(() => setLoading(false));
  }, [companyId, studentId]);

  const addNote = async () => {
    const text = newNote.trim();
    if (!text) return;
    setSavingNote(true);
    try {
      const res = await fetch(`/api/school/${companyId}/students/${studentId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const note = await res.json();
      if (note && note.id) {
        setNotes((prev) => [note, ...prev]);
        setNewNote("");
      }
    } finally {
      setSavingNote(false);
    }
  };

  const deleteNote = async (noteId: string) => {
    await fetch(`/api/school/${companyId}/students/${studentId}/notes`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId }),
    });
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
  };

  const back = (
    <Link
      href={`/companies/${companyId}/clients`}
      className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
    >
      ← Volver a Students
    </Link>
  );

  if (loading) return <div className="py-10 text-sm text-slate-400">Cargando…</div>;
  if (!detail)
    return (
      <div>
        {back}
        <p className="mt-6 text-sm text-slate-500">No se encontró el alumno.</p>
      </div>
    );

  const { student, profile, words, journal } = detail;
  const mastered = words.filter((w) => w.mastered).length;

  return (
    <div>
      {back}
      <div className="mt-3">
        <PageHeader
          title={student.name || student.email}
          description={student.email}
          actions={<StatusBadge status={student.status || "Active"} />}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Palabras" value={words.length} />
        <Stat label="Dominadas" value={mastered} />
        <Stat label="Journal" value={journal.length} />
        <Stat label="Día" value={profile?.current_day ?? "—"} />
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold text-slate-900">Perfil de aprendizaje</h2>
        {profile ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <Field label="Idioma" value={profile.language} />
            <Field label="Idioma nativo" value={profile.native_language} />
            <Field label="Nivel" value={profile.difficulty_level} />
            <Field label="XP" value={profile.xp} />
            <Field label="Racha" value={profile.daily_streak != null ? `${profile.daily_streak} días` : null} />
            <Field label="Última actividad" value={profile.last_active_date} />
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-400">
            Este alumno aún no tiene perfil de aprendizaje (no ha entrado al portal).
          </p>
        )}
      </div>

      {/* Notas de coaching — por alumno (owner/admin siempre; coach solo en SUS alumnos) */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold text-slate-900">📝 Coaching notes</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addNote();
            }}
            placeholder="Write an observation…"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
          />
          <button
            type="button"
            onClick={addNote}
            disabled={savingNote || !newNote.trim()}
            className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            {savingNote ? "…" : "Add"}
          </button>
        </div>
        {notes.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No notes yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {notes.map((n) => (
              <li
                key={n.id}
                className="group flex items-start justify-between gap-3 border-b border-slate-50 pb-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-800">{n.text}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {n.author} ·{" "}
                    {new Date(n.at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteNote(n.id)}
                  className="shrink-0 text-xs text-slate-400 opacity-0 transition hover:text-red-600 group-hover:opacity-100"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">Vocabulario ({words.length})</h2>
        </div>
        {words.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-400">Sin palabras todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 text-left">Palabra</th>
                  <th className="px-5 py-2 text-left">Traducción</th>
                  <th className="px-5 py-2 text-left">Idioma</th>
                  <th className="px-5 py-2 text-left">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {words.map((w) => (
                  <tr key={w.id}>
                    <td className="px-5 py-2 font-medium text-slate-800">{w.word || "—"}</td>
                    <td className="px-5 py-2 text-slate-600">{parseTranslation(w.translation)}</td>
                    <td className="px-5 py-2 text-slate-500">{w.language || "—"}</td>
                    <td className="px-5 py-2">
                      {w.mastered ? (
                        <StatusBadge status="Dominada" tone="green" />
                      ) : w.is_starred ? (
                        <StatusBadge status="Favorita" tone="yellow" />
                      ) : (
                        <span className="text-xs text-slate-400">Aprendiendo</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {journal.length > 0 && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-card">
          <div className="border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-900">Journal ({journal.length})</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {journal.map((j) => (
              <li key={j.id} className="px-5 py-3">
                <p className="text-xs text-slate-500">{j.date}</p>
                <p className="mt-0.5 text-sm text-slate-700">{j.text ? j.text.slice(0, 240) : "—"}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
