"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import type { ColumnDef } from "@/lib/types";

interface ProgressRow {
  id: string;
  name: string;
  email: string;
  language: string | null;
  level: string | null;
  status: string;
  progress?: {
    hasProfile: boolean;
    language: string | null;
    day: number | null;
    streak: number | null;
    words: number;
    journal: number;
  };
}

export default function ProgressModule({ slug }: { slug: string }) {
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/school/${slug}/students`)
      .then((r) => r.json())
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [slug]);

  const columns: ColumnDef<ProgressRow>[] = [
    {
      key: "name",
      header: "Student",
      render: (s) => (
        <div>
          <p className="font-medium text-slate-900">{s.name}</p>
          <p className="text-xs text-slate-500">{s.email}</p>
        </div>
      ),
    },
    {
      key: "language",
      header: "Idioma · Nivel",
      render: (s) => {
        const lang = s.progress?.language ?? s.language ?? "—";
        return s.level ? `${lang} · ${s.level}` : lang;
      },
    },
    {
      key: "day",
      header: "Día",
      render: (s) => (s.progress?.day != null ? `Día ${s.progress.day}` : "—"),
    },
    {
      key: "words",
      header: "Palabras",
      render: (s) => <span className="font-medium text-slate-900">{s.progress?.words ?? 0}</span>,
    },
    { key: "journal", header: "Journal", render: (s) => s.progress?.journal ?? 0 },
    {
      key: "streak",
      header: "Racha",
      render: (s) => (s.progress?.streak != null ? `${s.progress.streak} días` : "—"),
    },
    {
      key: "perfil",
      header: "Perfil",
      render: (s) =>
        s.progress?.hasProfile ? (
          <StatusBadge status="Activo" tone="green" />
        ) : (
          <span className="text-xs text-slate-400">Sin perfil</span>
        ),
    },
    { key: "status", header: "Status", render: (s) => <StatusBadge status={s.status} /> },
  ];

  const languages = Array.from(
    new Set(rows.map((s) => s.progress?.language ?? s.language).filter(Boolean))
  ) as string[];

  return (
    <div>
      <PageHeader
        title="Progress"
        description="Per-student learning progress from the student app."
      />
      {loading ? (
        <p className="px-1 py-8 text-sm text-slate-400">Cargando…</p>
      ) : (
        <DataTable<ProgressRow>
          columns={columns}
          rows={rows}
          searchKeys={["name", "email"]}
          searchPlaceholder="Search students..."
          filters={[{ key: "language", label: "Languages", options: languages }]}
          emptyTitle="No students yet"
          emptyDescription="Add students to see their progress here."
        />
      )}
    </div>
  );
}
