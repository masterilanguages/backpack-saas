"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { formatDate } from "@/lib/utils";

interface Task { id: string; title: string; assignee: string; due_date: string; status: string; }
interface CalendarEvent { id: string; title: string; date: string; time?: string; type?: string; }
interface School { id: string; slug: string; name: string; tagline?: string; accent_color: string; }

export default function CompanyDashboardPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [school, setSchool] = useState<School | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    fetch(`/api/school/${companyId}`).then((r) => r.json()).then(setSchool);
    fetch(`/api/school/${companyId}/tasks`).then((r) => r.json()).then((data) =>
      setTasks(data.filter((t: Task) => t.status !== "Done").slice(0, 5))
    );
    fetch(`/api/school/${companyId}/calendar`).then((r) => r.json()).then((data) =>
      setEvents([...data].sort((a: CalendarEvent, b: CalendarEvent) => a.date.localeCompare(b.date)).slice(0, 5))
    );
  }, [companyId]);

  return (
    <div>
      <PageHeader
        title={school ? `${school.name} dashboard` : "Dashboard"}
        description={school?.tagline}
        actions={
          <Link href={`/companies/${companyId}/settings`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
            Settings
          </Link>
        }
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-900">Open tasks</h2>
            <Link href={`/companies/${companyId}/tasks`} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">View all</Link>
          </div>
          <ul className="divide-y divide-slate-100 px-5">
            {tasks.length === 0 && <li className="py-4 text-sm text-slate-400">No open tasks.</li>}
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{task.title}</p>
                  <p className="text-xs text-slate-500">{task.assignee}{task.due_date ? ` · due ${formatDate(task.due_date)}` : ""}</p>
                </div>
                <StatusBadge status={task.status} />
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-900">Upcoming</h2>
            <Link href={`/companies/${companyId}/calendar`} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">Calendar</Link>
          </div>
          <ul className="divide-y divide-slate-100 px-5">
            {events.length === 0 && <li className="py-4 text-sm text-slate-400">No upcoming events.</li>}
            {events.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{event.title}</p>
                  <p className="text-xs text-slate-500">{formatDate(event.date)}{event.time ? ` · ${event.time}` : ""}</p>
                </div>
                <StatusBadge status={event.type ?? "Event"} tone="blue" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
