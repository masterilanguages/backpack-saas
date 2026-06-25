"use client";

import React, { useMemo, useState, useEffect } from "react";
import { Link } from "@/lib/router-compat";
import { ArrowLeft } from "lucide-react";
import { base44 as base44Client } from "@/api/base44Client";
// base44Client is a JS shim whose `entities` are built dynamically, so TS can't
// see entity keys. Cast to `any` for ergonomic access — the runtime shape is
// guaranteed by the shim.
const base44: any = base44Client;
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

function getGraphInsight(graph: any, chartData: any[]) {
  const values = chartData.map((d) => d[graph.dataKey]).filter((v) => v !== undefined);
  if (!values.length) return ["No data yet — start learning to see insights here!"];

  const max = Math.max(...values);
  const latest = values[values.length - 1];
  const nonZeroDays = values.filter((v) => v > 0).length;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  switch (graph.dataKey) {
    case "streak": {
      if (max === 0) return ["No streak yet", "Study every day to build your streak!"];
      if (latest === max) return [`🔥 Current streak: ${latest} days (your best!)`, "Keep going — don't break the chain!"];
      if (latest > 0) return [`🔥 Current streak: ${latest} days`, `🏆 Best streak: ${max} days`, "Can you beat your record?"];
      return [`🏆 Best streak: ${max} days`, "Start studying today to rebuild your streak!"];
    }
    case "vocabAdded": {
      if (max === 0) return ["No vocabulary added yet", "Head to the Backpack to start collecting words!"];
      const bestDay = chartData.find((d) => d.vocabAdded === max);
      return [
        `📅 Best day: ${bestDay?.day} with ${max} new words`,
        `📆 Active days: ${nonZeroDays} of the last 30`,
        `📊 Average: ${avg.toFixed(1)} words/day`,
      ];
    }
    case "vocabTotal": {
      if (latest === 0) return ["No words in your backpack yet", "Start adding vocabulary!"];
      const growthRate = nonZeroDays > 0 ? (latest / nonZeroDays).toFixed(1) : 0;
      return [
        `📚 Total words learned: ${latest}`,
        `⚡ Pace: ~${growthRate} words per active day`,
        `🎯 Next milestone: ${Math.round(latest * 1.5)} words`,
      ];
    }
    case "sessionsCompleted": {
      if (nonZeroDays === 0) return ["No completed sessions yet", "A session counts when you study 30+ minutes continuously"];
      const encourage = nonZeroDays >= 20 ? "Excellent consistency! 🏆" : nonZeroDays >= 10 ? "Good effort — keep it up!" : "Aim for 30 min daily for faster progress.";
      return [
        `✅ Completed sessions: ${nonZeroDays} in the last 30 days`,
        `⏱️ A session = 30+ minutes of continuous study`,
        encourage,
      ];
    }
    case "minutesStudied": {
      const totalMinutes = values.reduce((a, b) => a + b, 0);
      if (totalMinutes === 0) return ["No study time tracked yet", "The clock starts automatically when you sign in!"];
      const hours = (totalMinutes / 60).toFixed(1);
      return [
        `⏱️ Total time: ${totalMinutes.toFixed(0)} min (${hours} hrs) in 30 days`,
        `📅 Active days: ${nonZeroDays}`,
        totalMinutes > 300 ? "Impressive dedication! 💪" : "Try to study at least 10 min a day for steady progress.",
      ];
    }
    default:
      return ["Keep studying consistently to see trends here."];
  }
}

export default function Progress() {
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: userProfile } = useQuery({
    queryKey: ['userProfile', currentUser?.email],
    queryFn: async () => {
      const profiles = await base44.entities.UserProfile.filter({ created_by: currentUser.email });
      return profiles[0] || null;
    },
    enabled: !!currentUser?.email,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const { data: wordRatings = [] } = useQuery({
    queryKey: ['wordRatings', userProfile?.language, currentUser?.email],
    queryFn: () => base44.entities.Word.filter({ category: "wordbank", language: userProfile?.language || 'hebrew', created_by: currentUser.email }),
    enabled: !!userProfile && !!currentUser?.email,
  });

  const { data: dayProgress = [] } = useQuery({
    queryKey: ['dayProgress'],
    queryFn: () => base44.entities.DayProgress.list(),
  });

  const { data: studySessions = [] } = useQuery({
    queryKey: ['studySessions'],
    queryFn: () => base44.entities.StudySession.list(),
  });

  const chartData = useMemo(() => {
    const today = new Date();
    const days: any[] = [];

    const wordsByDate: Record<string, any[]> = {};
    for (const w of wordRatings) {
      if (!w.created_date) continue;
      const d = new Date(w.created_date).toDateString();
      if (!wordsByDate[d]) wordsByDate[d] = [];
      wordsByDate[d].push(w);
    }

    const progressByDate: Record<string, any[]> = {};
    for (const p of dayProgress) {
      if (!p.created_date && !p.updated_date) continue;
      const d = new Date(p.updated_date || p.created_date).toDateString();
      if (!progressByDate[d]) progressByDate[d] = [];
      progressByDate[d].push(p);
    }

    const sessionsByDate: Record<string, number> = {};
    const completedSessionsByDate: Record<string, number> = {};
    for (const s of studySessions) {
      const d = new Date(s.date).toDateString();
      if (!sessionsByDate[d]) sessionsByDate[d] = 0;
      sessionsByDate[d] += s.duration_minutes || 0;
      if (s.completed) {
        completedSessionsByDate[d] = (completedSessionsByDate[d] || 0) + 1;
      }
    }

    let runningStreak = 0;
    let runningTotalWords = 0;

    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toDateString();
      const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const wordsAddedToday = (wordsByDate[dateStr] || []).length;
      const sessionsCompletedToday = completedSessionsByDate[dateStr] || 0;
      const minutesStudiedToday = Math.round((sessionsByDate[dateStr] || 0) * 10) / 10;

      runningTotalWords += wordsAddedToday;

      const hadActivity = wordsAddedToday > 0 || sessionsCompletedToday > 0 || minutesStudiedToday > 0;
      runningStreak = hadActivity ? runningStreak + 1 : 0;

      days.push({
        day: label,
        streak: runningStreak,
        vocabAdded: wordsAddedToday,
        vocabTotal: runningTotalWords,
        sessionsCompleted: sessionsCompletedToday,
        minutesStudied: minutesStudiedToday,
      });
    }

    return days;
  }, [wordRatings, dayProgress, studySessions]);

  const graphs = [
    { title: "Daily Streak", description: "Consecutive days with any learning activity", dataKey: "streak", color: "#ef4444" },
    { title: "Vocab Added Per Day", description: "New words added to backpack each day", dataKey: "vocabAdded", color: "#8b5cf6" },
    { title: "Total Vocabulary", description: "Cumulative words in backpack over time", dataKey: "vocabTotal", color: "#06b6d4" },
    { title: "Sessions Completed", description: "Daily sessions/days marked as done", dataKey: "sessionsCompleted", color: "#10b981" },
    { title: "Time Studied (min)", description: "Minutes actively studying per day", dataKey: "minutesStudied", color: "#f59e0b" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link to="/home" className="text-white/60 hover:text-white">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-white">📊 Progress Tracking</h1>
            <p className="text-white/60">Your last 30 days of learning activity</p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Current Day', value: userProfile?.current_day || 1 },
            { label: 'Daily Streak 🔥', value: userProfile?.daily_streak || 0 },
            { label: 'Total Words', value: wordRatings.length },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 p-5 text-center">
              <p className="text-white/60 text-sm mb-1">{stat.label}</p>
              <p className="text-4xl font-bold text-white">{stat.value.toLocaleString()}</p>
            </div>
          ))}
        </div>

        {/* Graphs: left column stacked, right column explanations */}
        <div className="flex flex-col lg:flex-row gap-6">

          {/* Left: stacked graphs */}
          <div className="flex flex-col gap-5 lg:w-1/2">
            {graphs.map((graph, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.08 }}
                className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-5"
                style={{ height: 240 }}
              >
                <div className="mb-3">
                  <h3 className="text-base font-bold text-white">{graph.title}</h3>
                  <p className="text-white/40 text-xs">{graph.description}</p>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: -22, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis
                      dataKey="day"
                      stroke="rgba(255,255,255,0.2)"
                      tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                      interval={6}
                    />
                    <YAxis
                      stroke="rgba(255,255,255,0.2)"
                      tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                      allowDecimals={false}
                      domain={[0, 'auto']}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '8px',
                        fontSize: 12,
                      }}
                      labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
                      formatter={(value) => [value, graph.title]}
                    />
                    <Line
                      type="monotone"
                      dataKey={graph.dataKey}
                      stroke={graph.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: graph.color }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </motion.div>
            ))}
          </div>

          {/* Right: explanations */}
          <div className="flex flex-col gap-5 lg:w-1/2">
            {graphs.map((graph, idx) => {
              const insight = getGraphInsight(graph, chartData);
              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.08 + 0.05 }}
                  className="flex flex-col justify-center rounded-2xl border border-white/10 p-6"
                  style={{
                    background: `linear-gradient(135deg, ${graph.color}12 0%, rgba(255,255,255,0.03) 100%)`,
                    borderColor: `${graph.color}30`,
                    height: 240,
                  }}
                >
                  <div
                    className="inline-flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full w-fit"
                    style={{ background: `${graph.color}25`, color: graph.color }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: graph.color }}
                    />
                    {graph.title}
                  </div>
                  <ul className="space-y-1.5">
                    {insight.map((point, i) => (
                      <li key={i} className="text-white text-sm flex items-start gap-2">
                        <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: graph.color }} />
                        {point}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
