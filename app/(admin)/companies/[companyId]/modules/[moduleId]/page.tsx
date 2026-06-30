"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useCompany } from "@/lib/useCompany";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import ActionMenu from "@/components/ActionMenu";
import { ProgressBar } from "@/components/CompanySpecificPanel";
import { PlusIcon, CheckIcon } from "@/components/Icons";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  masteriCurriculum,
  masteriMnemonics,
  masteriProgress,
  masteriVocabulary,
} from "@/lib/mock/masteri";
import LandingPageEditor from "@/components/LandingPageEditor";
import VocabularyModule from "@/components/modules/VocabularyModule";
import ProgressModule from "@/components/modules/ProgressModule";
import type { Company, CurriculumUnit, StudentProgress, VocabularyItem } from "@/lib/types";

/* ================= Masteri: Curriculum ================= */

function MasteriCurriculum() {
  return (
    <DataTable<CurriculumUnit>
      columns={[
        {
          key: "unit",
          header: "Unit",
          render: (u) => <span className="font-medium text-slate-900">{u.unit}</span>,
        },
        { key: "language", header: "Language" },
        { key: "level", header: "Level" },
        { key: "topics", header: "Topics", className: "max-w-[320px] whitespace-normal" },
        { key: "lessonsCount", header: "Lessons" },
        { key: "status", header: "Status", render: (u) => <StatusBadge status={u.status} /> },
      ]}
      rows={masteriCurriculum}
      searchKeys={["unit", "language", "topics"]}
      searchPlaceholder="Search curriculum..."
      filters={[
        { key: "language", label: "Languages", options: ["Hebrew", "Spanish", "German"] },
        { key: "status", label: "Statuses", options: ["Published", "Draft"] },
      ]}
    />
  );
}

/* ================= Masteri: Vocabulary ================= */

function MasteriVocabulary() {
  return (
    <DataTable<VocabularyItem>
      columns={[
        {
          key: "word",
          header: "Word",
          render: (v) => <span className="font-medium text-slate-900">{v.word}</span>,
        },
        { key: "translation", header: "Translation" },
        { key: "language", header: "Language" },
        { key: "deck", header: "Deck" },
        {
          key: "mastery",
          header: "Mastery",
          render: (v) => (
            <div className="flex w-36 items-center gap-2">
              <ProgressBar value={v.mastery} className="flex-1" />
              <span className="w-9 text-right text-xs font-medium text-slate-600">
                {v.mastery}%
              </span>
            </div>
          ),
        },
      ]}
      rows={masteriVocabulary}
      searchKeys={["word", "translation", "deck"]}
      searchPlaceholder="Search vocabulary..."
      filters={[
        { key: "language", label: "Languages", options: ["Hebrew", "Spanish", "German"] },
        {
          key: "deck",
          label: "Decks",
          options: Array.from(new Set(masteriVocabulary.map((v) => v.deck))),
        },
      ]}
    />
  );
}

/* ================= Masteri: Mnemonics ================= */

function MasteriMnemonics() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {masteriMnemonics.map((m) => (
        <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">{m.word}</p>
              <p className="text-xs text-slate-500">{m.language}</p>
            </div>
            <ActionMenu />
          </div>
          <p className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-sm italic text-teal-900">
            “{m.mnemonic}”
          </p>
          <p className="mt-3 text-xs text-slate-400">by {m.createdBy}</p>
        </div>
      ))}
    </div>
  );
}

/* ================= Masteri: Progress ================= */

function MasteriProgressTable() {
  return (
    <DataTable<StudentProgress>
      columns={[
        {
          key: "student",
          header: "Student",
          render: (p) => (
            <div>
              <p className="font-medium text-slate-900">{p.student}</p>
              <p className="text-xs text-slate-500">
                {p.language} · {p.level}
              </p>
            </div>
          ),
        },
        {
          key: "lessons",
          header: "Course Progress",
          render: (p) => {
            const pct = Math.round((p.lessonsDone / p.lessonsTotal) * 100);
            return (
              <div className="flex w-44 items-center gap-2">
                <ProgressBar value={pct} className="flex-1" />
                <span className="whitespace-nowrap text-xs font-medium text-slate-600">
                  {p.lessonsDone}/{p.lessonsTotal}
                </span>
              </div>
            );
          },
        },
        { key: "vocabMastered", header: "Vocab Mastered" },
        {
          key: "homeworkRate",
          header: "Homework Rate",
          render: (p) => (
            <span
              className={cn(
                "font-medium",
                p.homeworkRate >= 80
                  ? "text-emerald-600"
                  : p.homeworkRate >= 60
                    ? "text-amber-600"
                    : "text-red-600"
              )}
            >
              {p.homeworkRate}%
            </span>
          ),
        },
        {
          key: "subscription",
          header: "Subscription",
          render: (p) => <StatusBadge status={p.subscription} />,
        },
      ]}
      rows={masteriProgress}
      searchKeys={["student", "language"]}
      searchPlaceholder="Search students..."
      filters={[
        { key: "language", label: "Languages", options: ["Hebrew", "Spanish", "German"] },
        {
          key: "subscription",
          label: "Subscriptions",
          options: ["Active", "Trial", "Past Due", "Cancelled"],
        },
      ]}
    />
  );
}

/* ================= Page ================= */

const MODULE_DESCRIPTIONS: Record<string, string> = {
  equipment: "Pre-event equipment checklists for every upcoming production.",
  packages: "The packages Avinu sells and how often they close.",
  curriculum: "Course units across every language and level.",
  vocabulary: "Shared vocabulary decks and student mastery.",
  mnemonics: "Memory hooks the Masteri method is built on.",
  progress: "Per-student progress, homework, and subscription health.",
  campaigns: "Paid and organic campaigns run for clients.",
  "brand-assets": "Deliverables and brand files per client.",
  pipeline: "Deals moving toward a signed engagement.",
  "landing-page": "Build and edit your public website landing page.",
};

export default function ModulePage() {
  const company = useCompany();
  const params = useParams<{ moduleId: string }>();
  const moduleDef = company.modules.find((m) => m.id === params.moduleId);

  if (!moduleDef) {
    return (
      <EmptyState
        title="Module not available"
        description={`"${params.moduleId}" is not a module of ${company.name}.`}
        action={
          <Link
            href={`/companies/${company.id}/dashboard`}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Back to dashboard
          </Link>
        }
      />
    );
  }

  const key = `${company.id}/${moduleDef.id}`;

  // Módulos REALES (cableados a BD por org_id) — para CUALQUIER escuela, no solo
  // Masteri. Cada escuela ve SUS datos porque el fetch va por slug -> org_id.
  if (moduleDef.id === "vocabulary") return <VocabularyModule slug={company.id} />;
  if (moduleDef.id === "progress") return <ProgressModule slug={company.id} />;

  let content: React.ReactNode = null;
  switch (key) {
    case "masteri/curriculum":
      content = <MasteriCurriculum />;
      break;
    case "masteri/vocabulary":
      content = <MasteriVocabulary />;
      break;
    case "masteri/mnemonics":
      content = <MasteriMnemonics />;
      break;
    case "masteri/progress":
      content = <MasteriProgressTable />;
      break;
    case "masteri/landing-page":
      content = <LandingPageEditor />;
      break;
  }

  const isLandingPage = moduleDef.id === "landing-page";

  return (
    <div>
      <PageHeader
        title={moduleDef.label}
        description={MODULE_DESCRIPTIONS[moduleDef.id]}
        actions={
          !isLandingPage && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              <PlusIcon /> Add record
            </button>
          )
        }
      />
      {content}
    </div>
  );
}
