"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight, Palette, User, Calendar, CalendarDays, Image as ImageIcon, MessageSquare, ClipboardCheck, Hash } from "lucide-react";

// Static catalog of the ported Slice C lessons. Each entry maps to a real
// route under /learn/lessons/*. The lesson content itself is faithful to
// the Base44 source pages (BodyPartsLesson, ColorsLesson, etc.).
const lessons = [
  {
    href: "/learn/lessons/colors",
    emoji: "🎨",
    icon: Palette,
    title: "Learn Colors",
    description: "Tap colors to reveal Hebrew, rate them, then play the color game.",
  },
  {
    href: "/learn/lessons/colors-test",
    emoji: "✅",
    icon: ClipboardCheck,
    title: "Colors Test",
    description: "Quiz yourself on the Hebrew color words you've learned.",
  },
  {
    href: "/learn/lessons/body-parts",
    emoji: "🦵",
    icon: User,
    title: "Body Parts",
    description: "Click body parts to see Hebrew and rate how well you know them.",
  },
  {
    href: "/learn/lessons/days-lesson",
    emoji: "📅",
    icon: Calendar,
    title: "Days of the Week",
    description: "Learn the Hebrew days of the week and rate them 1-5.",
  },
  {
    href: "/learn/lessons/days",
    emoji: "🗂️",
    icon: Hash,
    title: "Days Program",
    description: "Your day-by-day program with subsections and progress.",
  },
  {
    href: "/learn/lessons/months",
    emoji: "🗓️",
    icon: CalendarDays,
    title: "Months of the Year",
    description: "Learn the Hebrew months and rate how well you know them.",
  },
  {
    href: "/learn/lessons/pictures",
    emoji: "🖼️",
    icon: ImageIcon,
    title: "Picture Mnemonics",
    description: "Learn Hebrew words through visual associations and hints.",
  },
  {
    href: "/learn/lessons/pictures2",
    emoji: "🧠",
    icon: ImageIcon,
    title: "Pictures Lesson 2",
    description: "Test yourself with images only - no word hints.",
  },
  {
    href: "/learn/lessons/sentences",
    emoji: "💬",
    icon: MessageSquare,
    title: "Sentences",
    description: "Practice full sentences and phrases with flashcards.",
  },
];

export default function LessonsIndexPage() {
  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-400">
          Learn
        </p>
        <h1 className="mt-1 text-3xl font-extrabold text-white">Lessons</h1>
        <p className="mt-2 text-slate-400">
          Bite-sized lessons to build your Hebrew vocabulary. Tap a lesson to
          start.
        </p>
      </div>

      {/* Lesson grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lessons.map((lesson) => {
          const Icon = lesson.icon;
          return (
            <Link
              key={lesson.href}
              href={lesson.href}
              className="group flex flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-teal-700 hover:bg-slate-800/60"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/10 text-teal-400">
                  <Icon className="h-6 w-6" />
                </div>
                <ChevronRight className="h-5 w-5 text-slate-600 transition group-hover:text-teal-400" />
              </div>
              <h2 className="text-lg font-bold text-white">
                <span className="mr-1">{lesson.emoji}</span>
                {lesson.title}
              </h2>
              <p className="mt-1 text-sm text-slate-400">{lesson.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
