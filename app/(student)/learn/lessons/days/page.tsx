"use client";

import React, { useState, useEffect } from "react";
import { useNavigate, useParams, createPageUrl } from "@/lib/router-compat";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, Check, Lock, Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

export default function Days() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [editingDay, setEditingDay] = useState<any>(null);
  const [newSubsection, setNewSubsection] = useState({ name: "", duration: "", icon: "", page: "" });

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
      } catch (e) {}
    };
    fetchUser();
  }, []);

  const isAdmin = currentUser?.role === 'admin';

  const { data: userProfile } = useQuery({
    queryKey: ['userProfile', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return null;
      const profiles = await base44.entities.UserProfile.filter({ created_by: currentUser.email });
      return profiles[0] || null;
    },
    enabled: !!currentUser?.email,
  });

  const { data: days = [] } = useQuery({
    queryKey: ['days', userProfile?.language],
    queryFn: () => base44.entities.Day.filter({ language: userProfile?.language || 'hebrew' }),
    enabled: !!userProfile,
  });

  const { data: dayProgress = [] } = useQuery({
    queryKey: ['dayProgress'],
    queryFn: () => base44.entities.DayProgress.list(),
  });

  const updateDayMutation = useMutation({
    mutationFn: ({ id, data }: any) => base44.entities.Day.update(id, data),
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ['days'] });
      // A zero-row update under RLS resolves to null instead of throwing, so a
      // blanket success toast would lie to anyone who can't edit the schedule.
      if (updated) toast.success("Day updated!");
      else toast.error("You don't have permission to edit this session.");
    },
    onError: (e: any) => toast.error(`Couldn't update the session: ${e?.message || "unknown error"}`),
  });

  const createDayMutation = useMutation({
    mutationFn: (data: any) => base44.entities.Day.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['days'] });
      toast.success("Day created!");
    },
    // Without this the button is silently mute: RLS rejects the insert for anyone
    // who isn't an org admin, and nothing at all appears on screen.
    onError: (e: any) => toast.error(`Couldn't create the session: ${e?.message || "unknown error"}`),
  });

  const deleteDayMutation = useMutation({
    mutationFn: (id: any) => base44.entities.Day.delete(id),
    onSuccess: (deleted: any) => {
      queryClient.invalidateQueries({ queryKey: ['days'] });
      queryClient.invalidateQueries({ queryKey: ['dayProgress'] });
      // A delete forbidden by RLS removes zero rows and raises nothing.
      if (deleted?.length) toast.success("Day deleted.");
      else toast.error("You don't have permission to delete a day.");
    },
    onError: (e: any) => toast.error(`Couldn't delete the day: ${e?.message || "unknown error"}`),
  });

  // Deleting a day drops its tasks and, via the day_progress FK (ON DELETE CASCADE),
  // every student's progress on it. Irreversible, so it asks first and names the cost.
  const handleDeleteDay = (day: any) => {
    const taskCount = (day.subsections || []).length;
    const detail = taskCount > 0 ? ` and its ${taskCount} task${taskCount > 1 ? "s" : ""}` : "";
    if (!confirm(`Delete Day ${day.day_number}${detail}? Every student's progress on this day is deleted too. This cannot be undone.`)) return;
    deleteDayMutation.mutate(day.id);
  };

  const toggleSubsectionMutation = useMutation({
    mutationFn: async ({ dayId, subsectionId }: any) => {
      const progress = dayProgress.find((p: any) => p.day_id === dayId) || { day_id: dayId, day_number: 0, subsections_completed: [] };
      const isCompleted = progress.subsections_completed?.includes(subsectionId);
      const newCompleted = isCompleted
        ? progress.subsections_completed.filter((id: any) => id !== subsectionId)
        : [...(progress.subsections_completed || []), subsectionId];

      if (progress.id) {
        await base44.entities.DayProgress.update(progress.id, { subsections_completed: newCompleted });
      } else {
        await base44.entities.DayProgress.create({ day_id: dayId, day_number: 0, subsections_completed: newCompleted });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dayProgress'] }),
  });

  const currentDay = userProfile?.current_day || 1;
  const sortedDays = [...days].sort((a: any, b: any) => a.day_number - b.day_number);

  // Admins bypass the progress gate — otherwise the person who authors the
  // curriculum can't open any session past their own current_day, and the
  // add/remove-task controls live inside an expanded session. Matches /home.
  const isDayUnlocked = (dayNum: number) => isAdmin || dayNum <= currentDay;
  const getDayProgress = (dayId: any) => dayProgress.find((p: any) => p.day_id === dayId);

  const handleAddSubsection = (dayId: any) => {
    const day = days.find((d: any) => d.id === dayId);
    const updatedSubsections = [...(day.subsections || []), {
      id: Date.now().toString(),
      ...newSubsection
    }];
    updateDayMutation.mutate({ id: dayId, data: { subsections: updatedSubsections } });
    setNewSubsection({ name: "", duration: "", icon: "", page: "" });
    setEditingDay(null);
  };

  const handleDeleteSubsection = (dayId: any, subsectionId: any) => {
    const day = days.find((d: any) => d.id === dayId);
    const updatedSubsections = day.subsections.filter((s: any) => s.id !== subsectionId);
    updateDayMutation.mutate({ id: dayId, data: { subsections: updatedSubsections } });
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Days</h1>
            <p className="text-slate-400">Day {currentDay} of 100</p>
          </div>
          {isAdmin && (
            <Button onClick={() => {
              const nextDayNum = Math.max(...days.map((d: any) => d.day_number), 0) + 1;
              createDayMutation.mutate({
                day_number: nextDayNum,
                language: userProfile?.language || 'hebrew',
                title: `Day ${nextDayNum}`,
                subsections: [],
                order: nextDayNum,
              });
            }} className="bg-teal-500 hover:bg-teal-400 text-white">
              + Add Day
            </Button>
          )}
        </div>

        <div className="space-y-4">
          {sortedDays.map((day: any) => {
            const unlocked = isDayUnlocked(day.day_number);
            const progress = getDayProgress(day.id);
            const isEditing = editingDay === day.id;

            return (
              <motion.div
                key={day.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden ${
                  !unlocked ? 'opacity-50' : ''
                }`}
              >
                <button
                  onClick={() => unlocked && setEditingDay(isEditing ? null : day.id)}
                  disabled={!unlocked}
                  className="w-full p-6 text-left flex items-center justify-between hover:bg-slate-800 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      progress?.completed ? 'bg-green-500' : unlocked ? 'bg-teal-500/20 border-2 border-teal-500' : 'bg-slate-800'
                    }`}>
                      {progress?.completed ? (
                        <Check className="w-6 h-6 text-white" />
                      ) : !unlocked ? (
                        <Lock className="w-6 h-6 text-slate-500" />
                      ) : (
                        <span className="text-teal-400 font-bold">{day.day_number}</span>
                      )}
                    </div>
                    <div>
                      {/* Label is derived, never the stored `title`: rows created by the
                          two different buttons carry "Day N" or "Session N" and would
                          render inconsistently. `description` remains the free-text field. */}
                      <h3 className="text-white font-bold text-xl">Day {day.day_number}</h3>
                      {day.description && <p className="text-slate-400 text-sm">{day.description}</p>}
                    </div>
                  </div>
                  {unlocked && <ChevronRight className={`w-6 h-6 text-slate-400 transition-transform ${isEditing ? 'rotate-90' : ''}`} />}
                </button>

                {/* Sits outside the header <button> — a nested button is invalid HTML
                    and would swallow the expand/collapse click. */}
                {isAdmin && (
                  <div className="flex justify-end px-6 pb-3 -mt-3">
                    <button
                      onClick={() => handleDeleteDay(day)}
                      disabled={deleteDayMutation.isPending}
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete day
                    </button>
                  </div>
                )}

                <AnimatePresence>
                  {isEditing && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-6 pt-0 space-y-3">
                        {day.subsections?.map((subsection: any) => {
                          const isCompleted = progress?.subsections_completed?.includes(subsection.id);
                          return (
                            <div
                              key={subsection.id}
                              className={`border rounded-2xl p-4 flex items-center gap-3 ${
                                isCompleted ? 'bg-green-500/10 border-green-500/30' : 'bg-slate-800 border-slate-700'
                              }`}
                            >
                              <button
                                onClick={() => toggleSubsectionMutation.mutate({ dayId: day.id, subsectionId: subsection.id })}
                                className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
                                  isCompleted ? 'bg-green-500 border-green-500' : 'border-slate-600 hover:border-teal-400'
                                }`}
                              >
                                {isCompleted && <Check className="w-5 h-5 text-white" />}
                              </button>
                              <button
                                onClick={() => subsection.page && navigate(createPageUrl(subsection.page))}
                                className="flex-1 flex items-center gap-3 text-left"
                              >
                                <span className="text-2xl">{subsection.icon}</span>
                                <div className="flex-1">
                                  <p className={`text-white font-medium ${isCompleted ? 'line-through opacity-60' : ''}`}>{subsection.name}</p>
                                  <p className="text-slate-400 text-sm">{subsection.duration}</p>
                                </div>
                                {subsection.page && <ChevronRight className="w-5 h-5 text-slate-500" />}
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={() => handleDeleteSubsection(day.id, subsection.id)}
                                  className="text-red-400 hover:text-red-300"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          );
                        })}

                        {isAdmin && (
                          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                            <Input placeholder="Subsection name" value={newSubsection.name} onChange={(e) => setNewSubsection({...newSubsection, name: e.target.value})} className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-teal-500" />
                            <Input placeholder="Duration (e.g., 10 minutes)" value={newSubsection.duration} onChange={(e) => setNewSubsection({...newSubsection, duration: e.target.value})} className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-teal-500" />
                            <Input placeholder="Emoji icon" value={newSubsection.icon} onChange={(e) => setNewSubsection({...newSubsection, icon: e.target.value})} className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-teal-500" />
                            <Input placeholder="Page name (e.g., BabyVideos)" value={newSubsection.page} onChange={(e) => setNewSubsection({...newSubsection, page: e.target.value})} className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-teal-500" />
                            <Button onClick={() => handleAddSubsection(day.id)} className="w-full bg-teal-500 hover:bg-teal-400 text-white">
                              <Plus className="w-4 h-4 mr-2" /> Add Subsection
                            </Button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
