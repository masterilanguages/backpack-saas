"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ActionMenu from "@/components/ActionMenu";
import CreateModal from "@/components/CreateModal";
import { PlusIcon } from "@/components/Icons";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ColumnDef } from "@/lib/types";

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
}

export default function ClientsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

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
    { key: "language", header: "Language", render: (s) => s.language ?? "—" },
    { key: "level", header: "Level", render: (s) => s.level ?? "—" },
    { key: "phone", header: "Phone", render: (s) => s.phone ?? "—" },
    { key: "since", header: "Since", render: (s) => s.since ? formatDate(s.since) : "—" },
    {
      key: "total_value",
      header: "Lifetime Value",
      render: (s) => (
        <span className="font-medium text-slate-900">{formatCurrency(s.total_value ?? 0)}</span>
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
    </div>
  );
}
