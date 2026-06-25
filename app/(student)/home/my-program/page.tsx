"use client";

import React, { useState, useEffect } from "react";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Video, Calendar, Library } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Link, createPageUrl } from "@/lib/router-compat";

export default function MyProgram() {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
      } catch (e) {}
    };
    fetchUser();
    document.title = "My Program - Lashon Languages";
  }, []);

  const { data: myProgram = [] } = useQuery({
    queryKey: ['myProgram', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return [];
      return await base44.entities.UserProgram.filter({ user_email: currentUser.email });
    },
    enabled: !!currentUser?.email,
  });

  const { data: mediaLibrary = [] } = useQuery({
    queryKey: ['mediaLibrary'],
    queryFn: () => base44.entities.MediaLibrary.list(),
  });

  const completeVideoMutation = useMutation({
    mutationFn: ({ id, completed }: any) =>
      base44.entities.UserProgram.update(id, {
        completed,
        completed_at: completed ? new Date().toISOString() : null
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myProgram'] });
      toast.success("Progress updated!");
    },
  });

  const programWithVideos = myProgram.map((prog: any) => ({
    ...prog,
    video: mediaLibrary.find((v: any) => v.id === prog.media_library_id)
  })).filter((p: any) => p.video).sort((a: any, b: any) => a.order - b.order);

  const completedCount = programWithVideos.filter((p: any) => p.completed).length;
  const totalCount = programWithVideos.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">My Program</h1>
            <p className="text-white/60">Your personalized learning journey</p>
          </div>
          <Link to={createPageUrl("MediaLibrary")}>
            <Button className="bg-gradient-to-r from-cyan-500 to-blue-500">
              <Library className="w-5 h-5 mr-2" />
              Browse Library
            </Button>
          </Link>
        </div>

        {/* Progress Overview */}
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-bold text-xl">Your Progress</h2>
            <span className="text-white/60">{completedCount} / {totalCount} completed</span>
          </div>
          <div className="w-full h-4 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
            />
          </div>
        </div>

        {/* Video List */}
        <div className="space-y-4">
          <AnimatePresence>
            {programWithVideos.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-12 text-center"
              >
                <Video className="w-16 h-16 text-white/20 mx-auto mb-4" />
                <p className="text-white/60 mb-4">No videos assigned yet</p>
                <Link to={createPageUrl("MediaLibrary")}>
                  <Button className="bg-gradient-to-r from-cyan-500 to-blue-500">
                    Browse Media Library
                  </Button>
                </Link>
              </motion.div>
            ) : (
              programWithVideos.map((item: any) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-6 hover:border-white/30 transition-all ${
                    item.completed ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <button
                      onClick={() => completeVideoMutation.mutate({ id: item.id, completed: !item.completed })}
                      className={`mt-1 w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                        item.completed
                          ? 'bg-green-500 border-green-500'
                          : 'border-white/40 hover:border-cyan-400'
                      }`}
                    >
                      {item.completed && <CheckCircle2 className="w-5 h-5 text-white" />}
                    </button>

                    <div className="flex-1">
                      <h3 className={`text-white font-bold text-lg mb-2 ${item.completed ? 'line-through' : ''}`}>
                        {item.video.title}
                      </h3>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded">
                          {item.video.language}
                        </span>
                        <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded">
                          {item.video.difficulty_level}
                        </span>
                        {item.video.duration_minutes && (
                          <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">
                            {item.video.duration_minutes} min
                          </span>
                        )}
                      </div>

                      {item.video.topics && item.video.topics.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {item.video.topics.map((topic: any, idx: number) => (
                            <span key={idx} className="text-xs bg-white/10 text-white/70 px-2 py-0.5 rounded">
                              {topic}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button
                          onClick={() => window.open(item.video.video_url, '_blank')}
                          size="sm"
                          className="bg-gradient-to-r from-cyan-500 to-blue-500"
                        >
                          <Video className="w-4 h-4 mr-1" />
                          Watch
                        </Button>
                      </div>

                      {item.assigned_at && (
                        <p className="text-xs text-white/40 mt-3">
                          <Calendar className="w-3 h-3 inline mr-1" />
                          Assigned {new Date(item.assigned_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
