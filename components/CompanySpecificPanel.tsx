"use client";

import Link from "next/link";
import type { Company } from "@/lib/types";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { masteriProgress } from "@/lib/mock/masteri";
import StatusBadge from "./StatusBadge";

function Panel({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {href && (
          <Link href={href} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
            {linkLabel ?? "View all"}
          </Link>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div
        className={cn(
          "h-full rounded-full",
          value >= 75 ? "bg-emerald-500" : value >= 40 ? "bg-amber-500" : "bg-red-400"
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/* ---------- Masteri: student progress ---------- */

function MasteriPanels({ company }: { company: Company }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel
        title="Student progress"
        href={`/companies/${company.id}/modules/progress`}
        linkLabel="Full report"
      >
        <div className="space-y-4">
          {masteriProgress.slice(0, 5).map((p) => {
            const pct = Math.round((p.lessonsDone / p.lessonsTotal) * 100);
            return (
              <div key={p.id}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {p.student}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {p.language} · {p.level}
                    </span>
                  </p>
                  <span className="shrink-0 text-xs font-semibold text-slate-600">{pct}%</span>
                </div>
                <ProgressBar value={pct} />
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Subscription health" href={`/companies/${company.id}/finances`} linkLabel="Finances">
        <ul className="divide-y divide-slate-100">
          {masteriProgress.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{p.student}</p>
                <p className="text-xs text-slate-500">Homework rate {p.homeworkRate}%</p>
              </div>
              <StatusBadge status={p.subscription} />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}


export default function CompanySpecificPanel({ company }: { company: Company }) {
  return <MasteriPanels company={company} />;
}
