"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import type { ColumnDef } from "@/lib/types";

interface WordRow {
  id: string;
  word: string;
  translation: string | null;
  language: string | null;
  mastered: boolean | null;
  times_practiced: number | null;
  student: string;
}

export default function VocabularyModule({ slug }: { slug: string }) {
  const [rows, setRows] = useState<WordRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/school/${slug}/words`)
      .then((r) => r.json())
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [slug]);

  const columns: ColumnDef<WordRow>[] = [
    {
      key: "word",
      header: "Palabra",
      render: (w) => <span className="font-medium text-slate-900">{w.word}</span>,
    },
    { key: "translation", header: "Traducción", render: (w) => w.translation ?? "—" },
    { key: "language", header: "Idioma", render: (w) => w.language ?? "—" },
    {
      key: "mastered",
      header: "Dominada",
      render: (w) =>
        w.mastered ? (
          <StatusBadge status="Dominada" tone="green" />
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    { key: "times_practiced", header: "Prácticas", render: (w) => w.times_practiced ?? 0 },
    { key: "student", header: "Alumno", render: (w) => <span className="text-slate-600">{w.student}</span> },
  ];

  const languages = Array.from(new Set(rows.map((r) => r.language).filter(Boolean))) as string[];
  const students = Array.from(new Set(rows.map((r) => r.student).filter(Boolean))) as string[];

  return (
    <div>
      <PageHeader
        title="Vocabulary"
        description="Palabras reales que los alumnos están aprendiendo en el portal."
      />
      {loading ? (
        <p className="px-1 py-8 text-sm text-slate-400">Cargando…</p>
      ) : (
        <DataTable<WordRow>
          columns={columns}
          rows={rows}
          searchKeys={["word", "translation", "student"]}
          searchPlaceholder="Search vocabulary..."
          filters={[
            { key: "language", label: "Languages", options: languages },
            { key: "student", label: "Students", options: students },
          ]}
          emptyTitle="No vocabulary yet"
          emptyDescription="Aparecerá aquí cuando los alumnos guarden palabras en el portal."
        />
      )}
    </div>
  );
}
