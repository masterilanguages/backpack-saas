"use client";

import { useEffect, useRef, useState } from "react";
import { base44 as base44Client } from "@/api/base44Client";
// base44Client is a JS shim; TS can't see entity keys like `ScheduleSession`.
// Cast to `any` for ergonomic access — the runtime shape is guaranteed by the shim.
const base44: any = base44Client;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  Plus,
  Trash2,
  Link as LinkIcon,
  Loader2,
  X,
} from "lucide-react";
import {
  buildGoogleCalendarUrl,
  isoToLocalInput,
  localInputToIso,
} from "@/lib/googleCalendar";

interface SessionLink {
  label: string;
  url: string;
}

interface ScheduleSession {
  id: string;
  title: string;
  position: number;
  notes: string | null;
  links: SessionLink[] | null;
  scheduled_at: string | null;
  duration_minutes: number | null;
  created_date?: string;
}

// A local, editable copy of a session while its card is open.
interface Draft {
  title: string;
  notes: string;
  scheduledLocal: string; // datetime-local value
  durationMinutes: number;
  links: SessionLink[];
}

function toDraft(s: ScheduleSession): Draft {
  return {
    title: s.title || "",
    notes: s.notes || "",
    scheduledLocal: isoToLocalInput(s.scheduled_at),
    durationMinutes: s.duration_minutes ?? 60,
    links: Array.isArray(s.links) ? s.links.map((l) => ({ label: l.label || "", url: l.url || "" })) : [],
  };
}

export default function SchedulePage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    base44.auth
      .me()
      .then((u: any) => setEmail(u?.email ?? null))
      .catch(() => setEmail(null));
  }, []);

  const { data: sessions = [], isSuccess, isLoading } = useQuery<ScheduleSession[]>({
    queryKey: ["scheduleSessions", email],
    queryFn: async () => {
      const rows = await base44.entities.ScheduleSession.filter({ created_by: email });
      return [...(rows || [])].sort(
        (a: ScheduleSession, b: ScheduleSession) =>
          (a.position ?? 0) - (b.position ?? 0) ||
          (a.created_date || "").localeCompare(b.created_date || "")
      );
    },
    enabled: !!email,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => base44.entities.ScheduleSession.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scheduleSessions", email] }),
  });

  const bulkCreateMutation = useMutation({
    mutationFn: (rows: any[]) => base44.entities.ScheduleSession.bulkCreate(rows),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scheduleSessions", email] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      base44.entities.ScheduleSession.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduleSessions", email] });
      toast.success("Session saved ✓");
    },
    onError: () => toast.error("Could not save — please try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => base44.entities.ScheduleSession.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduleSessions", email] });
      toast.success("Session removed");
    },
    onError: () => toast.error("Could not remove the session."),
  });

  // First visit with an empty schedule: seed Session 1–4 so the page isn't blank.
  // Guarded so it runs at most once per mount even as queries settle.
  useEffect(() => {
    if (!isSuccess || !email || seededRef.current) return;
    if (sessions.length === 0) {
      seededRef.current = true;
      bulkCreateMutation.mutate(
        [1, 2, 3, 4].map((n) => ({
          title: `Session ${n}`,
          position: n - 1,
          notes: "",
          links: [],
          duration_minutes: 60,
        }))
      );
    }
  }, [isSuccess, email, sessions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleOpen = (s: ScheduleSession) => {
    if (openId === s.id) {
      setOpenId(null);
      setDraft(null);
    } else {
      setOpenId(s.id);
      setDraft(toDraft(s));
    }
  };

  const saveDraft = (id: string) => {
    if (!draft) return;
    updateMutation.mutate({
      id,
      data: {
        title: draft.title.trim() || "Session",
        notes: draft.notes,
        scheduled_at: localInputToIso(draft.scheduledLocal),
        duration_minutes: draft.durationMinutes || 60,
        links: draft.links.filter((l) => l.label.trim() || l.url.trim()),
      },
    });
  };

  const addSession = () => {
    const nextPos = sessions.length ? Math.max(...sessions.map((s) => s.position ?? 0)) + 1 : 0;
    createMutation.mutate(
      { title: `Session ${nextPos + 1}`, position: nextPos, notes: "", links: [], duration_minutes: 60 },
      {
        onError: () => toast.error("Could not add a session."),
        onSuccess: () => toast.success("Session added"),
      }
    );
  };

  // Show the spinner while auth/email resolves, while the list loads, and while
  // the first-visit seed of Session 1–4 is in flight. If the seed has already
  // been attempted (and e.g. failed), fall through to the empty state instead of
  // spinning forever — the user can still add sessions manually.
  const seedAttempted = bulkCreateMutation.isSuccess || bulkCreateMutation.isError;
  const loading =
    !email ||
    isLoading ||
    bulkCreateMutation.isPending ||
    (isSuccess && sessions.length === 0 && !seedAttempted);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-400">Backpack</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-extrabold text-white">
            <CalendarDays className="h-7 w-7 text-teal-400" />
            Schedule
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Your coaching sessions. You and your coach can add notes and links to each one, and drop
            any session straight into Google Calendar.
          </p>
        </div>
        <button
          type="button"
          onClick={addSession}
          disabled={createMutation.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-400 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Add session
        </button>
      </div>

      {/* Google Calendar banner */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-teal-500/25 bg-teal-500/5 px-4 py-3">
        <CalendarPlus className="mt-0.5 h-5 w-5 shrink-0 text-teal-400" />
        <p className="text-sm text-slate-300">
          Give a session a date & time, then hit{" "}
          <span className="font-semibold text-teal-300">Add to Google Calendar</span> to save it to
          your own calendar — notes and links come along for the ride.
        </p>
      </div>

      {/* Sessions */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 py-16 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Setting up your sessions…
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 py-16 text-center text-sm text-slate-400">
          No sessions yet. Add one to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s, i) => {
            const open = openId === s.id;
            const gcalUrl =
              open && draft
                ? buildGoogleCalendarUrl({
                    title: draft.title,
                    notes: draft.notes,
                    links: draft.links,
                    scheduledAt: localInputToIso(draft.scheduledLocal),
                    durationMinutes: draft.durationMinutes,
                  })
                : buildGoogleCalendarUrl({
                    title: s.title,
                    notes: s.notes,
                    links: s.links,
                    scheduledAt: s.scheduled_at,
                    durationMinutes: s.duration_minutes,
                  });

            return (
              <div
                key={s.id}
                className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"
              >
                {/* Card header (the "dropdown" toggle) */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleOpen(s)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-expanded={open}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/15 text-sm font-bold text-teal-300">
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">
                        {s.title || "Session"}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {s.scheduled_at
                          ? new Date(s.scheduled_at).toLocaleString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "No date set"}
                        {Array.isArray(s.links) && s.links.length > 0
                          ? ` · ${s.links.length} link${s.links.length > 1 ? "s" : ""}`
                          : ""}
                      </span>
                    </span>
                    <ChevronDown
                      className={`ml-auto h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Remove "${s.title || "this session"}"?`)) deleteMutation.mutate(s.id);
                    }}
                    aria-label="Remove session"
                    className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-white/5 hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Card body */}
                {open && draft && (
                  <div className="space-y-4 border-t border-slate-800 px-4 py-4">
                    {/* Title */}
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-400">Title</span>
                      <input
                        type="text"
                        value={draft.title}
                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-teal-500"
                      />
                    </label>

                    {/* Date/time + duration */}
                    <div className="flex flex-wrap gap-3">
                      <label className="block flex-1">
                        <span className="mb-1 block text-xs font-medium text-slate-400">
                          Date & time (optional)
                        </span>
                        <input
                          type="datetime-local"
                          value={draft.scheduledLocal}
                          onChange={(e) => setDraft({ ...draft, scheduledLocal: e.target.value })}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-teal-500 [color-scheme:dark]"
                        />
                      </label>
                      <label className="block w-28">
                        <span className="mb-1 block text-xs font-medium text-slate-400">Minutes</span>
                        <input
                          type="number"
                          min={15}
                          step={15}
                          value={draft.durationMinutes}
                          onChange={(e) =>
                            setDraft({ ...draft, durationMinutes: Number(e.target.value) || 60 })
                          }
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-teal-500"
                        />
                      </label>
                    </div>

                    {/* Notes */}
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-400">Notes</span>
                      <textarea
                        value={draft.notes}
                        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                        rows={3}
                        placeholder="What's the focus for this session?"
                        className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-teal-500"
                      />
                    </label>

                    {/* Links */}
                    <div>
                      <span className="mb-1 block text-xs font-medium text-slate-400">Links</span>
                      <div className="space-y-2">
                        {draft.links.map((link, li) => (
                          <div key={li} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={link.label}
                              placeholder="Label"
                              onChange={(e) => {
                                const links = [...draft.links];
                                links[li] = { ...links[li], label: e.target.value };
                                setDraft({ ...draft, links });
                              }}
                              className="w-32 shrink-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-teal-500"
                            />
                            <input
                              type="url"
                              value={link.url}
                              placeholder="https://…"
                              onChange={(e) => {
                                const links = [...draft.links];
                                links[li] = { ...links[li], url: e.target.value };
                                setDraft({ ...draft, links });
                              }}
                              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-teal-500"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setDraft({ ...draft, links: draft.links.filter((_, x) => x !== li) })
                              }
                              aria-label="Remove link"
                              className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-red-400"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setDraft({ ...draft, links: [...draft.links, { label: "", url: "" }] })
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:text-white"
                        >
                          <LinkIcon className="h-3.5 w-3.5" /> Add link
                        </button>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      {gcalUrl ? (
                        <a
                          href={gcalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-2 text-sm font-semibold text-teal-300 transition hover:bg-teal-500/20"
                        >
                          <CalendarPlus className="h-4 w-4" /> Add to Google Calendar
                        </a>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        onClick={() => saveDraft(s.id)}
                        disabled={updateMutation.isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-400 disabled:opacity-50"
                      >
                        {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
