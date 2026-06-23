import Link from "next/link";

export const metadata = {
  title: "Backpack Systems — The language learning operating system",
  description:
    "Backpack helps language schools onboard students, schedule sessions, deliver lessons, track progress, and keep learners accountable.",
};

const NAV_LINKS = [
  { label: "For Schools", href: "#schools" },
  { label: "For Learners", href: "#learners" },
  { label: "Pricing", href: "#pricing" },
];

const ONBOARDING_FEATURES = [
  {
    icon: "📋",
    title: "Student Onboarding",
    body: "Questionnaires, placement forms, goals, and learning preferences in one flow.",
  },
  {
    icon: "📅",
    title: "Scheduling",
    body: "Connect calendars, collect availability, and book recurring coaching sessions.",
  },
  {
    icon: "📚",
    title: "Learning Hub",
    body: "Lessons, vocabulary, mnemonics, flashcards, transcripts, and assignments.",
  },
  {
    icon: "📈",
    title: "Progress Tracking",
    body: "See attendance, completed work, vocabulary growth, and student activity.",
  },
];

const SCHOOL_FEATURES = [
  "Branded student portal",
  "Coach dashboard",
  "Student profiles",
  "Calendar integration",
  "Recurring session scheduling",
  "Homework and assignments",
  "Progress reports",
  "Admin control panel",
];

const LEARNER_FEATURES = [
  "Daily missions",
  "Vocabulary review",
  "Speaking drills",
  "Listening practice",
  "Flashcards",
  "Progress tracking",
];

const PRICING = [
  {
    name: "Starter",
    desc: "For independent coaches.",
    price: "$99",
    period: "/month",
    highlight: false,
    cta: "Get started",
  },
  {
    name: "School",
    desc: "For small language schools.",
    price: "$299",
    period: "/month",
    highlight: true,
    cta: "Request access",
  },
  {
    name: "Growth",
    desc: "For schools with multiple coaches and students.",
    price: "$599",
    period: "/month",
    highlight: false,
    cta: "Request access",
  },
  {
    name: "Enterprise",
    desc: "Custom setup for larger teams.",
    price: "Custom",
    period: "",
    highlight: false,
    cta: "Contact us",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-slate-900" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Navigation ── */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2">
            <span className="text-xl font-black tracking-tight" style={{ color: "#1e3a5f" }}>
              Backpack
            </span>
            <span className="hidden text-xs font-semibold uppercase tracking-widest text-slate-400 sm:inline">
              Systems
            </span>
          </a>
          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 sm:flex">
            {NAV_LINKS.map(({ label, href }) => (
              <a key={label} href={href} className="transition-colors hover:text-slate-900">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              Sign in
            </Link>
            <a
              href="#schools"
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: "#1e3a5f" }}
            >
              For Schools
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-24 text-center">
        <div
          className="mb-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest"
          style={{ backgroundColor: "#eef2ff", color: "#3b5ea6" }}
        >
          The language learning operating system
        </div>
        <h1
          className="mx-auto max-w-4xl text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl"
          style={{ color: "#0f1f38" }}
        >
          Run Your Language Program{" "}
          <span style={{ color: "#3b5ea6" }}>From One Place</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-slate-500">
          Backpack helps language schools onboard students, schedule sessions, deliver lessons,
          track progress, and keep learners accountable.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a
            href="#learners"
            className="rounded-xl px-8 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:opacity-90"
            style={{ backgroundColor: "#3b5ea6" }}
          >
            Start Learning
          </a>
          <a
            href="#schools"
            className="rounded-xl border-2 px-8 py-4 text-base font-semibold transition-colors hover:bg-slate-50"
            style={{ borderColor: "#1e3a5f", color: "#1e3a5f" }}
          >
            For Schools
          </a>
          <Link
            href="/login"
            className="rounded-xl border border-slate-200 px-8 py-4 text-base font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* ── What Backpack Does ── */}
      <section className="py-24" style={{ backgroundColor: "#f8fafd" }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#3b5ea6" }}>
              What Backpack does
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: "#0f1f38" }}>
              One Platform. Every Student Journey.
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {ONBOARDING_FEATURES.map(({ icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border bg-white p-7 shadow-sm transition-shadow hover:shadow-md"
                style={{ borderColor: "#e2e8f0" }}
              >
                <div className="mb-4 text-3xl">{icon}</div>
                <h3 className="mb-2 font-bold" style={{ color: "#0f1f38" }}>{title}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── For Schools ── */}
      <section id="schools" className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#3b5ea6" }}>
                For Schools & Coaches
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: "#0f1f38" }}>
                For Language Schools and Coaches
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-slate-500">
                Backpack gives your language program a professional system without needing to
                build software from scratch.
              </p>
              <ul className="mt-8 space-y-3">
                {SCHOOL_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-slate-700">
                    <span
                      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: "#3b5ea6" }}
                    >
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="mailto:hello@backpacksystems.com?subject=School Access Request"
                className="mt-10 inline-block rounded-xl px-8 py-4 text-base font-semibold text-white transition-colors hover:opacity-90"
                style={{ backgroundColor: "#1e3a5f" }}
              >
                Request School Access
              </a>
            </div>

            {/* Visual card */}
            <div
              className="rounded-3xl p-10"
              style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #3b5ea6 100%)" }}
            >
              <p className="mb-6 text-sm font-semibold uppercase tracking-widest text-blue-200">
                School Dashboard
              </p>
              <div className="space-y-3">
                {[
                  { label: "Active Students", value: "142" },
                  { label: "Sessions This Week", value: "38" },
                  { label: "Avg. Progress Score", value: "84%" },
                  { label: "Assignments Due", value: "12" },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-xl bg-white/10 px-5 py-3"
                  >
                    <span className="text-sm text-blue-100">{label}</span>
                    <span className="text-lg font-bold text-white">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-xl bg-white/10 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-200">
                  Recent Students
                </p>
                {["Maria G. — Intermediate Spanish", "James T. — Beginner French", "Yuki S. — Advanced English"].map((s) => (
                  <div key={s} className="py-2 text-sm text-blue-100 border-b border-white/10 last:border-0">
                    {s}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── For Learners ── */}
      <section id="learners" className="py-24" style={{ backgroundColor: "#f8fafd" }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            {/* Visual card */}
            <div className="order-2 lg:order-1 rounded-3xl border bg-white p-8 shadow-md" style={{ borderColor: "#e2e8f0" }}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest" style={{ color: "#3b5ea6" }}>
                Today's Mission
              </p>
              <h4 className="mb-6 text-xl font-bold" style={{ color: "#0f1f38" }}>Good morning, Maria 👋</h4>
              {[
                { task: "Vocabulary Review", done: true, count: "15 words" },
                { task: "Speaking Drill", done: true, count: "5 min" },
                { task: "Lesson: Past Tense", done: false, count: "10 min" },
                { task: "Listening Practice", done: false, count: "8 min" },
                { task: "Flashcards", done: false, count: "20 cards" },
              ].map(({ task, done, count }) => (
                <div
                  key={task}
                  className="mb-3 flex items-center gap-4 rounded-xl border px-4 py-3"
                  style={{ borderColor: done ? "#c7d7f5" : "#e2e8f0", backgroundColor: done ? "#f0f4ff" : "white" }}
                >
                  <span
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: done ? "#3b5ea6" : "#e2e8f0",
                      color: done ? "white" : "#94a3b8",
                    }}
                  >
                    {done ? "✓" : "○"}
                  </span>
                  <span className="flex-1 text-sm font-medium" style={{ color: done ? "#3b5ea6" : "#0f1f38" }}>
                    {task}
                  </span>
                  <span className="text-xs text-slate-400">{count}</span>
                </div>
              ))}
              <div className="mt-4 flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: "#eef2ff" }}>
                <span className="text-sm font-semibold" style={{ color: "#3b5ea6" }}>Daily progress</span>
                <span className="text-sm font-bold" style={{ color: "#1e3a5f" }}>2 / 5 complete</span>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#3b5ea6" }}>
                For Learners
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: "#0f1f38" }}>
                Know What To Practice Every Day
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-slate-500">
                Students get a clear daily learning path with lessons, review, speaking practice,
                and accountability.
              </p>
              <ul className="mt-8 space-y-3">
                {LEARNER_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-slate-700">
                    <span
                      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: "#3b5ea6" }}
                    >
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="/login"
                className="mt-10 inline-block rounded-xl px-8 py-4 text-base font-semibold text-white transition-colors hover:opacity-90"
                style={{ backgroundColor: "#3b5ea6" }}
              >
                Start Learning
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Powered by Backpack ── */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#3b5ea6" }}>
            Powered by Backpack
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: "#0f1f38" }}>
            The System Behind Masteri Languages
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-500">
            Backpack powers structured language learning experiences for Masteri and is built to
            support other schools, coaches, and education companies.
          </p>
          <div className="mt-10 inline-flex items-center gap-3 rounded-2xl border px-6 py-4" style={{ borderColor: "#c7d7f5", backgroundColor: "#f0f4ff" }}>
            <span className="text-2xl">🎒</span>
            <div className="text-left">
              <p className="text-sm font-bold" style={{ color: "#1e3a5f" }}>Masteri Languages</p>
              <p className="text-xs text-slate-500">Running on Backpack Systems</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-24" style={{ backgroundColor: "#f8fafd" }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#3b5ea6" }}>
              Pricing
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: "#0f1f38" }}>
              Simple Plans for Growing Language Programs
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PRICING.map(({ name, desc, price, period, highlight, cta }) => (
              <div
                key={name}
                className="relative flex flex-col rounded-2xl border p-7 shadow-sm"
                style={{
                  borderColor: highlight ? "#3b5ea6" : "#e2e8f0",
                  backgroundColor: highlight ? "#1e3a5f" : "white",
                  borderWidth: highlight ? 2 : 1,
                }}
              >
                {highlight && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold text-white"
                    style={{ backgroundColor: "#3b5ea6" }}
                  >
                    Most Popular
                  </div>
                )}
                <h3
                  className="text-lg font-bold"
                  style={{ color: highlight ? "white" : "#0f1f38" }}
                >
                  {name}
                </h3>
                <p className="mt-1 text-sm" style={{ color: highlight ? "#93c5fd" : "#64748b" }}>
                  {desc}
                </p>
                <div className="mt-6 mb-8">
                  <span
                    className="text-4xl font-extrabold"
                    style={{ color: highlight ? "white" : "#0f1f38" }}
                  >
                    {price}
                  </span>
                  {period && (
                    <span className="text-sm" style={{ color: highlight ? "#93c5fd" : "#64748b" }}>
                      {period}
                    </span>
                  )}
                </div>
                <a
                  href="mailto:hello@backpacksystems.com?subject=Pricing Inquiry"
                  className="mt-auto block rounded-xl py-3 text-center text-sm font-semibold transition-colors"
                  style={{
                    backgroundColor: highlight ? "white" : "#eef2ff",
                    color: highlight ? "#1e3a5f" : "#3b5ea6",
                  }}
                >
                  {cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-28" style={{ background: "linear-gradient(135deg, #0f1f38 0%, #1e3a5f 50%, #3b5ea6 100%)" }}>
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Build a Better Language Program
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-xl leading-relaxed text-blue-200">
            Stop running your school through scattered forms, spreadsheets, messages, and calendar
            links. Backpack brings the full student journey into one system.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <a
              href="mailto:hello@backpacksystems.com?subject=School Access Request"
              className="rounded-xl bg-white px-8 py-4 text-base font-bold transition-colors hover:bg-blue-50"
              style={{ color: "#1e3a5f" }}
            >
              For Schools
            </a>
            <Link
              href="/login"
              className="rounded-xl border-2 border-white/40 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-white/10"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t py-12" style={{ borderColor: "#e2e8f0" }}>
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2">
              <span className="text-lg font-black" style={{ color: "#1e3a5f" }}>Backpack</span>
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Systems</span>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
              <a href="https://masterilanguages.com" className="hover:text-slate-900 transition-colors">
                Masteri Languages
              </a>
              <a href="mailto:hello@backpacksystems.com" className="hover:text-slate-900 transition-colors">
                Contact
              </a>
              <a href="/privacy" className="hover:text-slate-900 transition-colors">
                Privacy
              </a>
              <a href="/terms" className="hover:text-slate-900 transition-colors">
                Terms
              </a>
            </nav>
            <p className="text-xs text-slate-400">
              © {new Date().getFullYear()} Backpack Systems
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
