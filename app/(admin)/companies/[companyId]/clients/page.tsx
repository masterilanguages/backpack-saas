"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ActionMenu from "@/components/ActionMenu";
import CreateModal from "@/components/CreateModal";
import { PlusIcon } from "@/components/Icons";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ColumnDef } from "@/lib/types";

interface StudentProgress {
  hasProfile: boolean;
  language: string | null;
  day: number | null;
  xp: number | null;
  streak: number | null;
  words: number;
  journal: number;
  lastActive: string | null;
}

interface Student {
  id: string;
  name: string;
  email: string;
  phone: string;
  language: string;
  level: string;
  since: string;
  total_value: number;
  status: string;
  progress?: StudentProgress;
}

export default function ClientsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);

  useEffect(() => {
    fetch(`/api/school/${companyId}/students`)
      .then((r) => r.json())
      .then(setStudents)
      .finally(() => setLoading(false));
  }, [companyId]);

  const columns: ColumnDef<Student>[] = [
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
    { key: "language", header: "Idioma", render: (s) => s.progress?.language ?? s.language ?? "—" },
    {
      key: "words",
      header: "Palabras",
      render: (s) => <span className="font-medium text-slate-900">{s.progress?.words ?? 0}</span>,
    },
    { key: "journal", header: "Journal", render: (s) => s.progress?.journal ?? 0 },
    {
      key: "day",
      header: "Progreso",
      render: (s) => (s.progress?.day != null ? `Día ${s.progress.day}` : "—"),
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
    {
      key: "id",
      header: "",
      render: (s) => (
        <ActionMenu
          items={[
            {
              label: "View details",
              onClick: () => router.push(`/companies/${companyId}/clients/${s.id}`),
            },
            {
              label: "Edit",
              onClick: () => setEditing(s),
            },
            {
              label: "Delete",
              destructive: true,
              onClick: async () => {
                await fetch(`/api/school/${companyId}/students`, {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: s.id }),
                });
                setStudents((prev) => prev.filter((x) => x.id !== s.id));
              },
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Students"
        description="Everyone currently enrolled."
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <PlusIcon /> Add student
          </button>
        }
      />
      <DataTable
        columns={columns}
        rows={students}
        searchKeys={["name", "email", "phone", "language"]}
        searchPlaceholder="Search students..."
        filters={[
          { key: "status", label: "Status", options: ["Active", "Paused", "Churned", "Trial"] },
          { key: "language", label: "Language", options: Array.from(new Set(students.map((s) => s.language).filter(Boolean))) },
        ]}
      />
      {modalOpen && (
        <CreateModal
          title="Add student"
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "email", label: "Email" },
            { name: "phone", label: "Phone" },
            { name: "language", label: "Language" },
            { name: "level", label: "Level", type: "select", options: ["Complete Beginner", "Beginner", "Intermediate", "Advanced"] },
            { name: "status", label: "Status", type: "select", options: ["Active", "Trial", "Paused", "Churned"] },
          ]}
          onSubmit={async (data) => {
            const res = await fetch(`/api/school/${companyId}/students`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            const newStudent = await res.json();
            setStudents((prev) => [newStudent, ...prev]);
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
      {editing && (
        <CreateModal
          title="Edit student"
          submitLabel="Update"
          initialValues={{
            name: editing.name ?? "",
            email: editing.email ?? "",
            phone: editing.phone ?? "",
            language: editing.language ?? "",
            level: editing.level ?? "",
            status: editing.status ?? "",
          }}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "email", label: "Email" },
            { name: "phone", label: "Phone" },
            { name: "language", label: "Language" },
            { name: "level", label: "Level", type: "select", options: ["Complete Beginner", "Beginner", "Intermediate", "Advanced"] },
            { name: "status", label: "Status", type: "select", options: ["Active", "Trial", "Paused", "Churned"] },
          ]}
          onSubmit={async (data) => {
            const res = await fetch(`/api/school/${companyId}/students`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: editing.id, ...data }),
            });
            const updated = await res.json();
            setStudents((prev) => prev.map((x) => (x.id === editing.id ? { ...x, ...updated } : x)));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
