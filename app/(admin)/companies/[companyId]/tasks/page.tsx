"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ActionMenu from "@/components/ActionMenu";
import CreateModal from "@/components/CreateModal";
import { PlusIcon } from "@/components/Icons";
import { formatDate } from "@/lib/utils";
import type { ColumnDef } from "@/lib/types";

interface Task {
  id: string;
  title: string;
  assignee: string;
  related: string;
  due_date: string;
  priority: string;
  status: string;
}

export default function TasksPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/school/${companyId}/tasks`)
      .then((r) => r.json())
      .then(setTasks);
  }, [companyId]);

  const columns: ColumnDef<Task>[] = [
    {
      key: "title",
      header: "Task",
      render: (t) => (
        <div>
          <p className="font-medium text-slate-900">{t.title}</p>
          <p className="text-xs text-slate-500">{t.related}</p>
        </div>
      ),
      className: "max-w-[340px] whitespace-normal",
    },
    { key: "assignee", header: "Assignee", render: (t) => t.assignee ?? "—" },
    { key: "due_date", header: "Due", render: (t) => t.due_date ? formatDate(t.due_date) : "—" },
    { key: "priority", header: "Priority", render: (t) => <StatusBadge status={t.priority} /> },
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
    {
      key: "id",
      header: "",
      render: (t) => (
        <ActionMenu
          items={[
            {
              label: "Mark Done",
              onClick: async () => {
                await fetch(`/api/school/${companyId}/tasks`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: t.id, status: "Done" }),
                });
                setTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status: "Done" } : x));
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
        title="Tasks"
        description="What needs to get done."
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <PlusIcon /> New task
          </button>
        }
      />
      <DataTable
        columns={columns}
        rows={tasks}
        searchKeys={["title", "assignee", "related"]}
        searchPlaceholder="Search tasks..."
        filters={[
          { key: "status", label: "Status", options: ["To Do", "In Progress", "Done", "Blocked"] },
          { key: "priority", label: "Priority", options: ["Low", "Medium", "High"] },
        ]}
      />
      {modalOpen && (
        <CreateModal
          title="New Task"
          fields={[
            { name: "title", label: "Title", required: true },
            { name: "assignee", label: "Assignee" },
            { name: "due_date", label: "Due Date", type: "date" },
            { name: "priority", label: "Priority", type: "select", options: ["High", "Medium", "Low"] },
            { name: "status", label: "Status", type: "select", options: ["To Do", "In Progress", "Done"] },
            { name: "related", label: "Related" },
          ]}
          onSubmit={async (data) => {
            const res = await fetch(`/api/school/${companyId}/tasks`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            const newTask = await res.json();
            setTasks((prev) => [newTask, ...prev]);
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
