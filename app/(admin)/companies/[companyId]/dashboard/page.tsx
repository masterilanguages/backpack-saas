"use client";

import Link from "next/link";
import { useCompany } from "@/lib/useCompany";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import CompanySpecificPanel from "@/components/CompanySpecificPanel";
import { formatDate } from "@/lib/utils";
import { useLocalStorage } from "@/lib/useLocalStorage";

export default function CompanyDashboardPage() {
  const company = useCompany();
  const [subscribers] = useLocalStorage<string[]>("masteri-newsletter-subscribers", []);
  const openTasks = company.data.tasks.filter((t) => t.status !== "Done").slice(0, 5);
  const upcoming = [...company.data.calendar]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  return (
    <div>
      <PageHeader
        title={`${company.name} dashboard`}
        description={company.tagline}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/companies/${company.id}/modules/landing-page`}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-white transition hover:opacity-95"
              style={{ backgroundColor: company.color }}
            >
              Website
            </Link>
            <Link
              href="/website"
              target="_blank"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              View live ↗
            </Link>
            <Link
              href={`/companies/${company.id}/settings`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Company settings
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {company.data.stats.map((stat) => (
          <StatCard key={stat.label} stat={stat} />
        ))}
      </div>

      <div className="mt-6">
        <CompanySpecificPanel company={company} />
      </div>

      {/* Newsletter widget */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Newsletter</h2>
            <p className="text-xs text-slate-400">{subscribers.length} subscriber{subscribers.length !== 1 ? "s" : ""}</p>
          </div>
          <Link
            href={`/companies/${company.id}/newsletter`}
            className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition"
          >
            Manage →
          </Link>
        </div>
        <div className="flex items-center gap-6 px-5 py-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-900">{subscribers.length}</p>
            <p className="text-xs text-slate-400">Subscribers</p>
          </div>
          <div className="h-10 w-px bg-slate-100" />
          <Link
            href={`/companies/${company.id}/newsletter?tab=compose`}
            className="text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            ✏️ Draft &amp; send a newsletter
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-900">Open tasks</h2>
            <Link
              href={`/companies/${company.id}/tasks`}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              View all
            </Link>
          </div>
          <ul className="divide-y divide-slate-100 px-5">
            {openTasks.map((task) => (
              <li key={task.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{task.title}</p>
                  <p className="text-xs text-slate-500">
                    {task.assignee} · due {formatDate(task.dueDate)}
                  </p>
                </div>
                <StatusBadge status={task.status} />
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-900">Upcoming</h2>
            <Link
              href={`/companies/${company.id}/calendar`}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              Calendar
            </Link>
          </div>
          <ul className="divide-y divide-slate-100 px-5">
            {upcoming.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{event.title}</p>
                  <p className="text-xs text-slate-500">
                    {formatDate(event.date)}
                    {event.time ? ` · ${event.time}` : ""}
                  </p>
                </div>
                <StatusBadge status={event.type} tone="blue" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
