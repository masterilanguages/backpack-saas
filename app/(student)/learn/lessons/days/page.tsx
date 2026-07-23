"use client";

import React, { useState, useEffect } from "react";
import { useNavigate, createPageUrl } from "@/lib/router-compat";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, Check, Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// The standard flow every session follows. Tasks are code-defined (stable ids
// so DayProgress persists) and merged with whatever custom tasks an admin has
// stored on the Day row. The first three steps deep-link to the session's
// video when one is assigned.
// ---------------------------------------------------------------------------
const TEMPLATE_TASKS = [
  { id: "tpl_watch_story", icon: "🎬", name: "Watch story (no translations)", video: true },
  { id: "tpl_watch_subtitles", icon: "💬", name: "Watch with subtitles", video: true },
  { id: "tpl_click_words", icon: "👆", name: "Click words", video: true },
  { id: "tpl_ai_vocab", icon: "🤖", name: "AI explains vocabulary", video: true },
  { id: "tpl_mnemonics", icon: "🧠", name: "Set mnemonics inside backpack", page: "Backpack" },
  { id: "tpl_shadow", icon: "🗣️", name: "Shadow speaker", page: "Practice" },
  { id: "tpl_roleplay", icon: "🎭", name: "Role-play scene", page: "Practice" },
  { id: "tpl_retell", icon: "📖", name: "Retell story", page: "Journal" },
];

// Lessons folded into the schedule (the standalone Lessons page is gone).
// Colors + Colors Test deliberately share one session.
const SESSION_LESSONS: Record<number, { id: string; icon: string; name: string; href: string }[]> = {
  1: [
    { id: "lesson_colors", icon: "🎨", name: "Learn Colors", href: "/learn/lessons/colors" },
    { id: "lesson_colors_test", icon: "✅", name: "Colors Test", href: "/learn/lessons/colors-test" },
  ],
  2: [
    { id: "lesson_body_parts", icon: "🦵", name: "Body Parts", href: "/learn/lessons/body-parts" },
  ],
  3: [
    { id: "lesson_pictures", icon: "🖼️", name: "Picture Mnemonics", href: "/learn/lessons/pictures" },
    { id: "lesson_pictures2", icon: "🧠", name: "Pictures Lesson 2", href: "/learn/lessons/pictures2" },
  ],
  4: [
    { id: "lesson_sentences", icon: "💬", name: "Sentences", href: "/learn/lessons/sentences" },
  ],
};

const TOTAL_SESSIONS = 100;
const VISIBLE_SESSIONS = 5;

export default function Schedule() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [addingTaskFor, setAddingTaskFor] = useState<any>(null);
  const [newTask, setNewTask] = useState({ name: "", icon: "", page: "" });

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const isAdmin = currentUser?.role === "admin";

  const { data: userProfile } = useQuery({
    queryKey: ["userProfile", currentUser?.email],
    queryFn: async () => {
      const profiles = await base44.entities.UserProfile.filter({ created_by: currentUser.email });
      return profiles[0] || null;
    },
    enabled: !!currentUser?.email,
  });

  const language = userProfile?.language || "hebrew";

  const { data: days = [] } = useQuery({
    queryKey: ["days", language],
    queryFn: () => base44.entities.Day.filter({ language }),
    enabled: !!userProfile,
  });

  const { data: dayProgress = [] } = useQuery({
    queryKey: ["dayProgress"],
    queryFn: () => base44.entities.DayProgress.list(),
  });

  const updateDayMutation = useMutation({
    mutationFn: ({ id, data }: any) => base44.entities.Day.update(id, data),
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ["days"] });
      if (updated) toast.success("Session updated!");
      else toast.error("You don't have permission to edit this session.");
    },
    onError: (e: any) => toast.error(`Couldn't update the session: ${e?.message || "unknown error"}`),
  });

  // Find the Day row for a session, or create it on demand (admins only —
  // RLS restricts day INSERT). Progress needs a real day_id to hang on.
  const ensureDayRow = async (sessionNumber: number) => {
    const existing = days.find((d: any) => d.day_number === sessionNumber);
    if (existing) return existing;
    try {
      const created = await base44.entities.Day.create({
        day_number: sessionNumber,
        language,
        title: `Day ${sessionNumber}`,
        subsections: [],
        order: sessionNumber,
      });
      queryClient.invalidateQueries({ queryKey: ["days"] });
      return created;
    } catch (e) {
      toast.error("This session isn't initialized yet — ask your teacher to open it once.");
      return null;
    }
  };

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ sessionNumber, taskId, allTaskIds }: any) => {
      const day = await ensureDayRow(sessionNumber);
      if (!day) return;
      const progress = dayProgress.find((p: any) => p.day_id === day.id);
      const done = progress?.subsections_completed || [];
      const newCompleted = done.includes(taskId)
        ? done.filter((id: any) => id !== taskId)
        : [...done, taskId];
      const completedAll = allTaskIds.every((id: string) => newCompleted.includes(id));
      if (progress?.id) {
        await base44.entities.DayProgress.update(progress.id, {
          subsections_completed: newCompleted,
          completed: completedAll,
        });
      } else {
        await base44.entities.DayProgress.create({
          day_id: day.id,
          day_number: sessionNumber,
          subsections_completed: newCompleted,
          completed: completedAll,
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dayProgress"] }),
    onError: (e: any) => toast.error(`Couldn't save progress: ${e?.message || "unknown error"}`),
  });

  const handleAddCustomTask = async (sessionNumber: number) => {
    if (!newTask.name.trim()) return;
    const day = await ensureDayRow(sessionNumber);
    if (!day) return;
    const updated = [...(day.subsections || []), { id: Date.now().toString(), ...newTask }];
    updateDayMutation.mutate({ id: day.id, data: { subsections: updated } });
    setNewTask({ name: "", icon: "", page: "" });
    setAddingTaskFor(null);
  };

  const handleDeleteCustomTask = (day: any, taskId: string) => {
    const updated = (day.subsections || []).filter((s: any) => s.id !== taskId);
    updateDayMutation.mutate({ id: day.id, data: { subsections: updated } });
  };

  const currentDay = userProfile?.current_day || 1;

  // Build the render model for one session: template steps (wired to the
  // session's video when assigned) + its lessons + admin's custom tasks.
  const buildSession = (sessionNumber: number) => {
    const day = days.find((d: any) => d.day_number === sessionNumber) || null;
    const stored = day?.subsections || [];
    const videoTask = stored.find((s: any) => s.video_id);
    const customTasks = stored.filter((s: any) => !s.video_id);

    const tasks: any[] = [];
    for (const t of TEMPLATE_TASKS) {
      let target: string | null = null;
      if (t.video) {
        target = videoTask
          ? `MediaLibrary?videoId=${videoTask.video_id}${day ? `&dayId=${day.id}&taskId=${t.id}` : ""}`
          : "MediaLibrary";
      } else if (t.page) {
        target = t.page;
      }
      tasks.push({ id: t.id, icon: t.icon, name: t.name, target, custom: false });
    }
    for (const l of SESSION_LESSONS[sessionNumber] || []) {
      tasks.push({ id: l.id, icon: l.icon, name: l.name, target: l.href, custom: false });
    }
    for (const c of customTasks) {
      tasks.push({ id: c.id, icon: c.icon || "📌", name: c.name, target: c.page || null, custom: true });
    }

    const progress = day ? dayProgress.find((p: any) => p.day_id === day.id) : null;
    const completedIds = new Set(progress?.subsections_completed || []);
    const doneCount = tasks.filter((t) => completedIds.has(t.id)).length;

    return { sessionNumber, day, videoTask, tasks, completedIds, doneCount };
  };

  const sessions = Array.from({ length: VISIBLE_SESSIONS }, (_, i) => buildSession(i + 1));

  const openTask = (session: any, task: any) => {
    if (!task.target) return;
    navigate(createPageUrl(task.target));
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto w-full max-w-5xl pb-16">
        {/* Header */}
        <div className="mb-8 pt-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-400">Learn</p>
          <h1 className="mt-1 text-3xl font-extrabold text-white">Schedule</h1>
          <p className="mt-2 text-slate-400">
            Session {Math.min(currentDay, TOTAL_SESSIONS)} of {TOTAL_SESSIONS} · complete each step to move forward
          </p>
        </div>

        <div className="space-y-6">
          {sessions.map(({ sessionNumber, day, videoTask, tasks, completedIds, doneCount }, idx) => {
            const unlocked = isAdmin || sessionNumber <= currentDay;
            const allDone = tasks.length > 0 && doneCount === tasks.length;
            const allTaskIds = tasks.map((t) => t.id);
            const thumb = videoTask?.video_id
              ? `https://i.ytimg.com/vi/${videoTask.video_id}/hqdefault.jpg`
              : null;

            return (
              <motion.div
                key={sessionNumber}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
                className={`overflow-hidden rounded-2xl border bg-slate-900 ${
                  allDone ? "border-emerald-500/40" : "border-slate-800"
                } ${!unlocked ? "opacity-60" : ""}`}
              >
                {/* Session header */}
                <div className="flex items-center gap-4 border-b border-slate-800 p-5">
                  <div
                    className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold ${
                      allDone
                        ? "bg-emerald-500 text-white"
                        : unlocked
                        ? "border-2 border-teal-500 bg-teal-500/15 text-teal-300"
                        : "bg-slate-800 text-slate-500"
                    }`}
                  >
                    {allDone ? <Check className="h-6 w-6" /> : !unlocked ? <Lock className="h-5 w-5" /> : sessionNumber}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-bold text-white">Session {sessionNumber}</h2>
                    <p className="truncate text-sm text-slate-400">
                      {videoTask ? videoTask.name.replace(/^[▶\s]+/, "") : day?.description || "Story, vocabulary and speaking practice"}
                    </p>
                    {/* Progress bar */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-full rounded-full transition-all ${allDone ? "bg-emerald-500" : "bg-teal-500"}`}
                          style={{ width: `${tasks.length ? (doneCount / tasks.length) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">
                        {doneCount}/{tasks.length}
                      </span>
                    </div>
                  </div>
                  {thumb && unlocked && (
                    <img
                      src={thumb}
                      alt=""
                      className="hidden h-20 w-36 flex-shrink-0 cursor-pointer rounded-xl object-cover sm:block"
                      onClick={() => navigate(createPageUrl(`MediaLibrary?videoId=${videoTask.video_id}`))}
                      onError={(e: any) => { e.target.style.display = "none"; }}
                    />
                  )}
                </div>

                {/* Task tiles */}
                {unlocked && (
                  <div className="grid grid-cols-1 gap-2.5 p-5 sm:grid-cols-2">
                    {tasks.map((task, tIdx) => {
                      const done = completedIds.has(task.id);
                      return (
                        <div
                          key={task.id}
                          className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                            done
                              ? "border-emerald-500/30 bg-emerald-500/10"
                              : "border-slate-800 bg-slate-950/60 hover:border-teal-600/50"
                          }`}
                        >
                          <button
                            onClick={() => toggleTaskMutation.mutate({ sessionNumber, taskId: task.id, allTaskIds })}
                            aria-label={done ? "Mark incomplete" : "Mark complete"}
                            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border-2 transition ${
                              done ? "border-emerald-500 bg-emerald-500" : "border-slate-600 hover:border-teal-400"
                            }`}
                          >
                            {done && <Check className="h-4 w-4 text-white" />}
                          </button>
                          <button
                            onClick={() => openTask({ sessionNumber, day }, task)}
                            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                            disabled={!task.target}
                          >
                            <span className="w-6 flex-shrink-0 text-right text-xs font-semibold text-slate-500">
                              {tIdx + 1}.
                            </span>
                            <span className="text-lg">{task.icon}</span>
                            <span className={`min-w-0 flex-1 truncate text-sm font-medium ${done ? "text-slate-400 line-through" : "text-white"}`}>
                              {task.name}
                            </span>
                            {task.target && <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-600" />}
                          </button>
                          {/* Custom tasks are user-manageable for everyone —
                              users get the same schedule controls as admins. */}
                          {task.custom && day && (
                            <button
                              onClick={() => handleDeleteCustomTask(day, task.id)}
                              className="flex-shrink-0 text-slate-600 transition hover:text-red-400"
                              aria-label="Delete task"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* Add a custom task to this session — open to every user
                        (same control as admins; day UPDATE is member-writable). */}
                    {(
                      addingTaskFor === sessionNumber ? (
                        <div className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-950/60 p-3 sm:col-span-2">
                          <div className="flex flex-wrap gap-2">
                            <Input placeholder="Task name" value={newTask.name} onChange={(e) => setNewTask({ ...newTask, name: e.target.value })} className="flex-1 min-w-[160px] border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus:border-teal-500" />
                            <Input placeholder="Emoji" value={newTask.icon} onChange={(e) => setNewTask({ ...newTask, icon: e.target.value })} className="w-20 border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus:border-teal-500" />
                            <Input placeholder="Page (optional)" value={newTask.page} onChange={(e) => setNewTask({ ...newTask, page: e.target.value })} className="w-40 border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 focus:border-teal-500" />
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={() => handleAddCustomTask(sessionNumber)} className="bg-teal-500 text-white hover:bg-teal-400">
                              <Plus className="mr-1 h-4 w-4" /> Add
                            </Button>
                            <Button variant="outline" onClick={() => setAddingTaskFor(null)} className="border-slate-700 text-slate-300">
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setAddingTaskFor(sessionNumber); setNewTask({ name: "", icon: "", page: "" }); }}
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-700 p-3 text-sm text-slate-500 transition hover:border-teal-600 hover:text-teal-400"
                        >
                          <Plus className="h-4 w-4" /> Add task
                        </button>
                      )
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          Sessions {VISIBLE_SESSIONS + 1}–{TOTAL_SESSIONS} unlock as your program continues.
        </p>
      </div>
    </div>
  );
}
