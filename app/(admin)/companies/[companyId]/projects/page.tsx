"use client";

import { useState, useEffect } from "react";
import { useCompany } from "@/lib/useCompany";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ActionMenu from "@/components/ActionMenu";
import CreateModal from "@/components/CreateModal";
import { PlusIcon } from "@/components/Icons";
import { formatDate } from "@/lib/utils";
import type { ColumnDef } from "@/lib/types";

interface Lesson {
  id: string;
  student_id: string | null;
  student: string;
  coach: string | null;
  language: string | null;
  date: string | null;
  time: string | null;
  topic: string | null;
  status: string;
}

export default function ProjectsPage() {
  const company = useCompany();
  const slug = company.id;
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string; coach?: string | null }[]>([]);
  const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/school/${slug}/lessons`).then((r) => r.json()),
      fetch(`/api/school/${slug}/students`).then((r) => r.json()),
      fetch(`/api/school/${slug}/team`).then((r) => r.json()),
    ])
      .then(([l, s, t]) => {
        setLessons(Array.isArray(l) ? l : []);
        setStudents(Array.isArray(s) ? s : []);
        setTeam(Array.isArray(t) ? t : []);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const onDelete = async (id: string) => {
    await fetch(`/api/school/${slug}/lessons`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setLessons((prev) => prev.filter((l) => l.id !== id));
  };

  const columns: ColumnDef<Lesson>[] = [
    {
      key: "student",
      header: "Student",
      render: (l) => <span className="font-medium text-slate-900">{l.student}</span>,
    },
    { key: "coach", header: "Coach", render: (l) => l.coach ?? "—" },
    { key: "language", header: "Language", render: (l) => l.language ?? "—" },
    {
      key: "date",
      header: "When",
      render: (l) => (l.date ? `${formatDate(l.date)}${l.time ? ` · ${l.time}` : ""}` : "—"),
    },
    { key: "topic", header: "Topic", className: "max-w-[260px] truncate", render: (l) => l.topic ?? "—" },
    { key: "status", header: "Status", render: (l) => <StatusBadge status={l.status} /> },
    {
      key: "id",
      header: "",
      render: (l) => (
        <ActionMenu items={[{ label: "Delete", destructive: true, onClick: () => onDelete(l.id) }]} />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={company.labels.projects}
        description="Scheduled and past coaching sessions."
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <PlusIcon /> New lesson
          </button>
        }
      />
      {loading ? (
        <p className="px-1 py-8 text-sm text-slate-400">Cargando…</p>
      ) : (
        <DataTable<Lesson>
          columns={columns}
          rows={lessons}
          searchKeys={["student", "coach", "language", "topic"]}
          searchPlaceholder="Search lessons..."
          filters={[
            { key: "status", label: "Statuses", options: ["Scheduled", "Completed", "Cancelled", "No-Show"] },
            {
              key: "language",
              label: "Languages",
              options: Array.from(new Set(lessons.map((l) => l.language).filter(Boolean))) as string[],
            },
          ]}
          emptyTitle="No lessons yet"
          emptyDescription="Programa la primera sesión con el botón 'New lesson'."
        />
      )}
      {modalOpen && (
        <CreateModal
          title="New Lesson"
          onFieldChange={(name, value) => {
            // al elegir el alumno, autocompletar su coach asignado
            if (name === "student") {
              const stu = students.find((s) => s.name === value);
              return { coach: stu?.coach ?? "" };
            }
          }}
          fields={[
            { name: "student", label: "Student", type: "select", required: true, options: students.map((s) => s.name) },
            { name: "coach", label: "Coach", type: "select", options: team.map((t) => t.name) },
            { name: "language", label: "Language" },
            { name: "date", label: "Date", type: "date" },
            { name: "time", label: "Time" },
            { name: "topic", label: "Topic" },
            { name: "status", label: "Status", type: "select", options: ["Scheduled", "Completed", "Cancelled", "No-Show"] },
          ]}
          onSubmit={async (data) => {
            const student = students.find((s) => s.name === data.student);
            const res = await fetch(`/api/school/${slug}/lessons`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                student_id: student?.id ?? null,
                coach: data.coach || null,
                language: data.language || null,
                date: data.date || null,
                time: data.time || null,
                topic: data.topic || null,
                status: data.status || "Scheduled",
              }),
            });
            const created = await res.json();
            if (created && created.id) {
              setLessons((prev) => [{ ...created, student: student?.name ?? "—" }, ...prev]);
            }
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
