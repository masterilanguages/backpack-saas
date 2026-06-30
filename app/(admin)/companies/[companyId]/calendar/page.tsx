"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import CreateModal from "@/components/CreateModal";
import { PlusIcon } from "@/components/Icons";
import { cn, formatDate } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const EVENT_COLOR = "#0d9488"; // teal = eventos del calendario
const LESSON_COLOR = "#6366f1"; // indigo = lecciones

interface CalItem {
  id: string;
  title: string;
  date: string;
  time?: string | null;
  type?: string | null;
  isLesson: boolean;
}

export default function CalendarPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [events, setEvents] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  // Mes visible (navegable). YEAR/MONTH derivan de aquí, asi el resto no cambia.
  const [view, setView] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const YEAR = view.y;
  const MONTH = view.m;
  const monthLabel = new Date(YEAR, MONTH, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  const shiftMonth = (delta: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const goToday = () => {
    const d = new Date();
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  useEffect(() => {
    fetch(`/api/school/${companyId}/calendar`)
      .then((r) => r.json())
      .then((d) => setEvents(Array.isArray(d) ? d : []))
      .catch(() => setEvents([]));
    fetch(`/api/school/${companyId}/lessons`)
      .then((r) => r.json())
      .then((d) => setLessons(Array.isArray(d) ? d : []))
      .catch(() => setLessons([]));
  }, [companyId]);

  // Unificamos eventos + lecciones en una sola lista para pintar.
  const items: CalItem[] = [
    ...events.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      time: e.time,
      type: e.type ?? "Event",
      isLesson: false,
    })),
    ...lessons
      .filter((l) => l.date)
      .map((l) => ({
        id: `lesson-${l.id}`,
        title: `${l.topic || "Lesson"}${l.student && l.student !== "—" ? ` · ${l.student}` : ""}`,
        date: l.date,
        time: l.time,
        type: "Lesson",
        isLesson: true,
      })),
  ];

  const itemsByDate = new Map<string, CalItem[]>();
  for (const it of items) {
    const list = itemsByDate.get(it.date) ?? [];
    list.push(it);
    itemsByDate.set(it.date, list);
  }

  const daysInMonth = new Date(YEAR, MONTH + 1, 0).getDate();
  const firstWeekday = (new Date(YEAR, MONTH, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const sorted = [...items].sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Lessons and events"
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <PlusIcon /> New event
          </button>
        }
      />

      {/* Navegación de mes + leyenda */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            ‹
          </button>
          <span className="min-w-[150px] text-center text-sm font-semibold text-slate-800">{monthLabel}</span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
          >
            ›
          </button>
          <button
            type="button"
            onClick={goToday}
            className="ml-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: EVENT_COLOR }} /> Events
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: LESSON_COLOR }} /> Lessons
          </span>
        </div>
      </div>

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
            const dayItems = day !== null ? itemsByDate.get(dateKey) ?? [] : [];
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
                      {dayItems.map((it) => (
                        <div
                          key={it.id}
                          className="truncate rounded px-1.5 py-0.5 text-[11px] font-medium text-white"
                          style={{ backgroundColor: it.isLesson ? LESSON_COLOR : EVENT_COLOR }}
                          title={`${it.title}${it.time ? ` · ${it.time}` : ""}`}
                        >
                          {it.time ? `${it.time} ` : ""}
                          {it.title}
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

      {/* Agenda list */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-900">Agenda</h2>
        </div>
        {sorted.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            No events or lessons yet. Add one with "New event" or schedule a lesson.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sorted.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: it.isLesson ? LESSON_COLOR : EVENT_COLOR }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{it.title}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(it.date)}
                      {it.time ? ` · ${it.time}` : ""}
                    </p>
                  </div>
                </div>
                <StatusBadge status={it.isLesson ? "Lesson" : it.type ?? "Event"} tone={it.isLesson ? "purple" : "blue"} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {modalOpen && (
        <CreateModal
          title="New event"
          fields={[
            { name: "title", label: "Title", required: true },
            { name: "date", label: "Date", type: "date", required: true },
            { name: "time", label: "Time" },
            { name: "type", label: "Type" },
          ]}
          onSubmit={async (data) => {
            const res = await fetch(`/api/school/${companyId}/calendar`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            const created = await res.json();
            if (created && created.id) setEvents((prev) => [...prev, created]);
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
