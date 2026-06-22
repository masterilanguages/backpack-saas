"use client";

import { useCompany } from "@/lib/useCompany";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { cn, formatDate } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// All mock data lives in June 2026
const YEAR = 2026;
const MONTH = 5; // 0-indexed June

export default function CalendarPage() {
  const company = useCompany();
  const events = company.data.calendar;

  const eventsByDate = new Map<string, typeof events>();
  for (const event of events) {
    const list = eventsByDate.get(event.date) ?? [];
    list.push(event);
    eventsByDate.set(event.date, list);
  }

  const daysInMonth = new Date(YEAR, MONTH + 1, 0).getDate();
  // Monday-first offset
  const firstWeekday = (new Date(YEAR, MONTH, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <PageHeader
        title="Calendar"
        description={`June ${YEAR} — everything scheduled for ${company.name}.`}
      />

      {/* Month grid (tablet and up) */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card md:block">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const dateKey =
              day !== null
                ? `${YEAR}-${String(MONTH + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                : "";
            const dayEvents = day !== null ? eventsByDate.get(dateKey) ?? [] : [];
            return (
              <div
                key={i}
                className={cn(
                  "min-h-[96px] border-b border-r border-slate-100 p-2 [&:nth-child(7n)]:border-r-0",
                  day === null && "bg-slate-50/60"
                )}
              >
                {day !== null && (
                  <>
                    <p className="text-xs font-medium text-slate-400">{day}</p>
                    <div className="mt-1 space-y-1">
                      {dayEvents.map((event) => (
                        <div
                          key={event.id}
                          className="truncate rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
                          style={{ backgroundColor: company.color }}
                          title={`${event.title}${event.time ? ` · ${event.time}` : ""}`}
                        >
                          {event.time ? `${event.time} ` : ""}
                          {event.title}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Agenda list (always on mobile, below grid on desktop) */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-card md:mt-6">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">Agenda</h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {sorted.map((event) => (
            <li key={event.id} className="flex items-center justify-between gap-3 px-5 py-3">
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
  );
}
