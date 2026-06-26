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

  useEffect(() => {
    fetch(`/api/school/${companyId}/students/${studentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [companyId, studentId]);

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
