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
import type { ColumnDef, Task } from "@/lib/types";

export default function TasksPage() {
  const company = useCompany();
  const [tasks, setTasks] = useLocalStorage<Task[]>("masteri-tasks", company.data.tasks);
  const [modalOpen, setModalOpen] = useState(false);

  const columns: ColumnDef<Task>[] = [
    {
      key: "title",
      header: "Task",
      render: (task) => (
        <div>
          <p className="font-medium text-slate-900">{task.title}</p>
          <p className="text-xs text-slate-500">{task.related}</p>
        </div>
      ),
      className: "max-w-[340px] whitespace-normal",
    },
    { key: "assignee", header: "Assignee" },
    { key: "dueDate", header: "Due", render: (task) => formatDate(task.dueDate) },
    {
      key: "priority",
      header: "Priority",
      render: (task) => <StatusBadge status={task.priority} />,
    },
    {
      key: "status",
      header: "Status",
      render: (task) => <StatusBadge status={task.status} />,
    },
    {
      key: "id",
      header: "",
      render: (task) => (
        <ActionMenu
          items={[
            {
              label: "Delete",
              destructive: true,
              onClick: () => setTasks((prev) => prev.filter((t) => t.id !== task.id)),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={company.labels.tasks}
        description={`What needs to get done at ${company.name}.`}
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
          {
            key: "status",
            label: "Statuses",
            options: ["To Do", "In Progress", "Done", "Blocked"],
          },
          { key: "priority", label: "Priorities", options: ["Low", "Medium", "High"] },
        ]}
      />
      {modalOpen && (
        <CreateModal
          title="New Task"
          fields={[
            { name: "title", label: "Title", required: true },
            { name: "assignee", label: "Assignee" },
            { name: "dueDate", label: "Due Date", type: "date" },
            { name: "priority", label: "Priority", type: "select", options: ["High", "Medium", "Low"] },
            { name: "status", label: "Status", type: "select", options: ["To Do", "In Progress", "Done"] },
            { name: "related", label: "Related" },
          ]}
          onSubmit={(data) => {
            const newTask: Task = {
              id: Date.now().toString(),
              title: data.title,
              assignee: data.assignee ?? "",
              dueDate: data.dueDate ?? "",
              priority: (data.priority as Task["priority"]) ?? "Medium",
              status: (data.status as Task["status"]) ?? "To Do",
              related: data.related ?? "",
            };
            setTasks((prev) => [newTask, ...prev]);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
