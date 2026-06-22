"use client";

import { useState } from "react";
import { useCompany } from "@/lib/useCompany";
import { useLocalStorage } from "@/lib/useLocalStorage";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ActionMenu from "@/components/ActionMenu";
import CreateModal from "@/components/CreateModal";
import { PlusIcon } from "@/components/Icons";
import { formatDate } from "@/lib/utils";
import { masteriLessons } from "@/lib/mock/masteri";
import type { ColumnDef, MasteriLesson } from "@/lib/types";

function MasteriLessonsTable({
  lessons,
  onDelete,
}: {
  lessons: MasteriLesson[];
  onDelete: (id: string) => void;
}) {
  const columns: ColumnDef<MasteriLesson>[] = [
    {
      key: "student",
      header: "Student",
      render: (l) => <span className="font-medium text-slate-900">{l.student}</span>,
    },
    { key: "coach", header: "Coach" },
    { key: "language", header: "Language" },
    { key: "level", header: "Level" },
    {
      key: "date",
      header: "When",
      render: (l) => `${formatDate(l.date)} · ${l.time}`,
    },
    { key: "topic", header: "Topic", className: "max-w-[260px] truncate" },
    { key: "status", header: "Status", render: (l) => <StatusBadge status={l.status} /> },
    {
      key: "id",
      header: "",
      render: (l) => (
        <ActionMenu
          items={[
            { label: "Delete", destructive: true, onClick: () => onDelete(l.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={lessons}
      searchKeys={["student", "coach", "language", "topic"]}
      searchPlaceholder="Search lessons..."
      filters={[
        {
          key: "status",
          label: "Statuses",
          options: ["Scheduled", "Completed", "Cancelled", "No-Show"],
        },
        {
          key: "language",
          label: "Languages",
          options: ["Hebrew", "Spanish", "German"],
        },
      ]}
    />
  );
}

export default function ProjectsPage() {
  const company = useCompany();
  const [lessons, setLessons] = useLocalStorage<MasteriLesson[]>(
    "masteri-lessons",
    masteriLessons
  );
  const [modalOpen, setModalOpen] = useState(false);

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
      <MasteriLessonsTable
        lessons={lessons}
        onDelete={(id) => setLessons((prev) => prev.filter((l) => l.id !== id))}
      />
      {modalOpen && (
        <CreateModal
          title="New Lesson"
          fields={[
            { name: "student", label: "Student", required: true },
            { name: "coach", label: "Coach" },
            { name: "language", label: "Language" },
            { name: "level", label: "Level" },
            { name: "date", label: "Date", type: "date" },
            { name: "time", label: "Time" },
            { name: "topic", label: "Topic" },
            {
              name: "status",
              label: "Status",
              type: "select",
              options: ["Scheduled", "Completed", "No-Show"],
            },
          ]}
          onSubmit={(data) => {
            const newLesson: MasteriLesson = {
              id: Date.now().toString(),
              student: data.student,
              coach: data.coach ?? "",
              language: data.language ?? "",
              level: data.level ?? "",
              date: data.date ?? new Date().toISOString().slice(0, 10),
              time: data.time ?? "",
              topic: data.topic ?? "",
              status: (data.status as MasteriLesson["status"]) ?? "Scheduled",
            };
            setLessons((prev) => [newLesson, ...prev]);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
