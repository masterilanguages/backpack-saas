"use client";

import { useState } from "react";

const CORE_FEATURES = [
  "Daily sessions and structure",
  "Vocabulary and speaking drills",
  "Accountability and coaching support",
  "Access to the Masteri Mnemonics System",
];

const ELITE_FEATURES = [
  "Daily sessions and structure",
  "Vocabulary and speaking drills",
  "Accountability and coaching support",
  "Access to the Masteri Mnemonics System",
  "Personalized fluency roadmap",
  "Custom curriculum development",
  "Quarterly fluency assessments",
  "Priority coach access",
  "Real-world conversation training",
  "Speaking, listening, reading, and writing development",
];

type Plan = {
  key: string;
  header: string;
  title: string;
  subtitle: string;
  details: string;
  features: string[];
  outcome: string;
  price: string;
  priceLabel?: string;
  priceNote: string;
  note?: string;
  button: string;
  featured: boolean;
  elite: boolean;
  badge: string | null;
};

const PLANS: Plan[] = [
  {
    key: "foundation",
    header: "4 WEEKS • FOUNDATION",
    title: "Foundation",
    subtitle: "Build the habit and learn the Masteri system.",
    details: "Group Coaching • 1 Session Per Week",
    features: CORE_FEATURES,
    outcome: "Build a consistent language habit and master the learning process.",
    price: "$995",
    priceNote: "One-time payment",
    button: "Get Started",
    featured: false,
    elite: false,
    badge: null,
  },
  {
    key: "kickstart",
    header: "4 WEEKS • MOST POPULAR",
    title: "Kickstart",
    subtitle: "The fastest way to start speaking with confidence.",
    details: "Private 1:1 Coaching • 3 Sessions Per Week",
    features: CORE_FEATURES,
    outcome: "Start speaking with confidence in everyday situations.",
    price: "$1,995",
    priceNote: "One-time payment",
    button: "Apply Now",
    featured: true,
    elite: false,
    badge: "MOST POPULAR",
  },
  {
    key: "fluency",
    header: "8 WEEKS • PREMIUM",
    title: "Fluency Accelerator",
    subtitle: "Maximum support for accelerated fluency.",
    details: "Private 1:1 Coaching • 4 Sessions Per Week",
    features: CORE_FEATURES,
    outcome:
      "Hold real conversations comfortably and think more naturally in your target language.",
    price: "$3,795",
    priceNote: "One-time payment",
    button: "Apply Now",
    featured: false,
    elite: false,
    badge: null,
  },
  {
    key: "accelerator",
    header: "12 MONTHS • ELITE",
    title: "Masteri Accelerator",
    subtitle:
      "From beginner to confident speaker with a year of structured coaching and accountability.",
    details: "Immersive Coaching • 5 Sessions Per Week",
    features: ELITE_FEATURES,
    outcome:
      "Develop advanced speaking ability, long-term retention, and real-world fluency through a full year of guided coaching and accountability.",
    price: "$4,500",
    priceLabel: "/ Quarter",
    priceNote: "4 Quarterly Payments · 12 Months",
    note: "Designed for learners committed to achieving real fluency.",
    button: "Apply for Mastery",
    featured: false,
    elite: true,
    badge: "ELITE PROGRAM",
  },
];

function PlanCard({
  plan,
  loading,
  onCheckout,
}: {
  plan: Plan;
  loading: string | null;
  onCheckout: (key: string) => void;
}) {
  const base = plan.elite
    ? "border-0 bg-slate-950 text-white shadow-2xl"
    : plan.featured
    ? "border-teal-600 bg-slate-950 text-white shadow-2xl"
    : "border-slate-200 bg-white text-slate-900 shadow-sm";

  const headerColor = plan.elite
    ? "text-amber-400"
    : plan.featured
    ? "text-teal-400"
    : "text-teal-600";

  const detailColor = plan.elite
    ? "text-amber-400"
    : plan.featured
    ? "text-teal-400"
    : "text-teal-700";

  const dividerColor =
    plan.featured || plan.elite ? "bg-slate-800" : "bg-slate-100";

  const metaColor =
    plan.featured || plan.elite ? "text-slate-500" : "text-slate-400";

  const bodyColor =
    plan.featured || plan.elite ? "text-slate-300" : "text-slate-700";

  const outcomeColor =
    plan.featured || plan.elite ? "text-slate-300" : "text-slate-600";

  const outcomeBg =
    plan.featured || plan.elite ? "bg-slate-900" : "bg-slate-50";

  const priceColor =
    plan.featured || plan.elite ? "text-white" : "text-slate-900";

  const priceNoteColor =
    plan.featured || plan.elite ? "text-slate-500" : "text-slate-400";

  const checkBg = plan.elite
    ? "bg-amber-400 text-slate-900"
    : plan.featured
    ? "bg-teal-500 text-white"
    : "bg-teal-100 text-teal-700";

  return (
    <div className={`relative flex flex-col rounded-2xl border p-7 ${base}`}>
      {/* Elite gold border overlay */}
      {plan.elite && (
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-amber-400/60" />
      )}

      {/* Badge */}
      {plan.badge && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span
            className={`rounded-full px-4 py-1 text-[11px] font-bold uppercase tracking-widest ${
              plan.elite
                ? "bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900"
                : "bg-teal-500 text-white"
            }`}
          >
            {plan.badge}
          </span>
        </div>
      )}

      {/* Header */}
      <p className={`mb-5 text-[11px] font-bold uppercase tracking-widest ${headerColor}`}>
        {plan.header}
      </p>

      {/* Title + subtitle */}
      <h3 className={`text-xl font-extrabold tracking-tight ${priceColor}`}>
        {plan.title}
      </h3>
      <p className={`mt-2 text-sm leading-relaxed ${plan.featured || plan.elite ? "text-slate-400" : "text-slate-500"}`}>
        {plan.subtitle}
      </p>

      {/* Program details */}
      <p className={`mt-4 text-xs font-semibold uppercase tracking-wide ${detailColor}`}>
        {plan.details}
      </p>

      <div className={`my-5 h-px ${dividerColor}`} />

      {/* Included label */}
      <p className={`mb-3 text-[11px] font-bold uppercase tracking-widest ${metaColor}`}>
        Included
      </p>

      {/* Features */}
      <ul className="flex-1 space-y-2.5">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${checkBg}`}>
              ✓
            </span>
            <span className={`text-sm leading-snug ${bodyColor}`}>{f}</span>
          </li>
        ))}
      </ul>

      {/* Outcome */}
      <div className={`mt-5 rounded-xl p-4 ${outcomeBg}`}>
        <p className={`mb-1 text-[10px] font-bold uppercase tracking-widest ${metaColor}`}>
          Outcome
        </p>
        <p className={`text-sm leading-snug ${outcomeColor}`}>{plan.outcome}</p>
      </div>

      {/* Note (elite only) */}
      {plan.note && (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
          <p className="text-xs italic text-slate-400">"{plan.note}"</p>
        </div>
      )}

      {/* Price */}
      <div className="mt-7">
        <div className="flex items-end gap-1.5">
          <p className={`text-4xl font-extrabold tracking-tight ${priceColor}`}>
            {plan.price}
          </p>
          {plan.priceLabel && (
            <p className="mb-1 text-base font-semibold text-amber-400">
              {plan.priceLabel}
            </p>
          )}
        </div>
        <p className={`mt-1 text-xs ${priceNoteColor}`}>{plan.priceNote}</p>
      </div>

      {/* Button */}
      <button
        onClick={() => onCheckout(plan.key)}
        disabled={loading === plan.key}
        className={`mt-5 w-full rounded-xl py-3.5 text-sm font-bold tracking-wide transition disabled:opacity-60 ${
          plan.elite
            ? "bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-900 hover:from-amber-300 hover:to-yellow-200"
            : plan.featured
            ? "bg-teal-500 text-white hover:bg-teal-400"
            : "border border-slate-300 bg-white text-slate-900 hover:border-teal-600 hover:text-teal-700"
        }`}
      >
        {loading === plan.key ? "Redirecting…" : plan.button}
      </button>
    </div>
  );
}

export default function PricingSection() {
  const [loading, setLoading] = useState<string | null>(null);

  const handleCheckout = async (planKey: string) => {
    setLoading(planKey);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planKey }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      setLoading(null);
    }
  };

  return (
    <section id="programs" className="bg-white px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-14 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-teal-600">
            Programs
          </p>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Choose Your Program
          </h2>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4 items-stretch">
          {PLANS.map((plan) => (
            <PlanCard key={plan.key} plan={plan} loading={loading} onCheckout={handleCheckout} />
          ))}
        </div>
      </div>
    </section>
  );
}
