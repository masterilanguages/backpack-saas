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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['days'] });
      toast.success("Day updated!");
    },
  });

  const createDayMutation = useMutation({
    mutationFn: (data: any) => base44.entities.Day.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['days'] });
      toast.success("Day created!");
    },
  });

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

  const isDayUnlocked = (dayNum: number) => dayNum <= currentDay;
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Days</h1>
            <p className="text-white/60">Day {currentDay} of 100</p>
          </div>
          {isAdmin && (
            <Button onClick={() => {
              const nextDayNum = Math.max(...days.map((d: any) => d.day_number), 0) + 1;
              createDayMutation.mutate({
                day_number: nextDayNum,
                language: userProfile?.language || 'hebrew',
                title: `Day ${nextDayNum}`,
                subsections: []
              });
            }} className="bg-green-500 hover:bg-green-600">
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
                className={`bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden ${
                  !unlocked ? 'opacity-50' : ''
                }`}
              >
                <button
                  onClick={() => unlocked && setEditingDay(isEditing ? null : day.id)}
                  disabled={!unlocked}
                  className="w-full p-6 text-left flex items-center justify-between hover:bg-white/5 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      progress?.completed ? 'bg-green-500' : unlocked ? 'bg-cyan-500/20 border-2 border-cyan-500' : 'bg-white/10'
                    }`}>
                      {progress?.completed ? (
                        <Check className="w-6 h-6 text-white" />
                      ) : !unlocked ? (
                        <Lock className="w-6 h-6 text-white/40" />
                      ) : (
                        <span className="text-white font-bold">{day.day_number}</span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-white font-bold text-xl">{day.title || `Day ${day.day_number}`}</h3>
                      {day.description && <p className="text-white/60 text-sm">{day.description}</p>}
                    </div>
                  </div>
                  {unlocked && <ChevronRight className={`w-6 h-6 text-white transition-transform ${isEditing ? 'rotate-90' : ''}`} />}
                </button>

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
                              className={`bg-gradient-to-br from-white/5 to-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-4 flex items-center gap-3 ${
                                isCompleted ? 'from-green-500/10 to-green-600/10 border-green-500/30' : ''
                              }`}
                            >
                              <button
                                onClick={() => toggleSubsectionMutation.mutate({ dayId: day.id, subsectionId: subsection.id })}
                                className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
                                  isCompleted ? 'bg-green-500 border-green-500' : 'border-white/40 hover:border-cyan-400'
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
                                  <p className="text-white/60 text-sm">{subsection.duration}</p>
                                </div>
                                {subsection.page && <ChevronRight className="w-5 h-5 text-white/40" />}
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
                          <div className="bg-white/10 rounded-xl p-4 space-y-2">
                            <Input placeholder="Subsection name" value={newSubsection.name} onChange={(e) => setNewSubsection({...newSubsection, name: e.target.value})} className="bg-white/5 border-white/20 text-white" />
                            <Input placeholder="Duration (e.g., 10 minutes)" value={newSubsection.duration} onChange={(e) => setNewSubsection({...newSubsection, duration: e.target.value})} className="bg-white/5 border-white/20 text-white" />
                            <Input placeholder="Emoji icon" value={newSubsection.icon} onChange={(e) => setNewSubsection({...newSubsection, icon: e.target.value})} className="bg-white/5 border-white/20 text-white" />
                            <Input placeholder="Page name (e.g., BabyVideos)" value={newSubsection.page} onChange={(e) => setNewSubsection({...newSubsection, page: e.target.value})} className="bg-white/5 border-white/20 text-white" />
                            <Button onClick={() => handleAddSubsection(day.id)} className="w-full bg-green-500 hover:bg-green-600">
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
