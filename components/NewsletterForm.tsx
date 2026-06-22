"use client";

import { useState } from "react";

export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("loading");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        sessionStorage.setItem("masteri_email", email);
        setState("done");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="text-center">
        <p className="text-xl font-bold text-white">✅ Welcome to Masteri</p>
        <p className="mt-3 text-base font-semibold text-slate-200">
          Get your personalized fluency plan in under 2 minutes.
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Answer a few questions and we&apos;ll recommend the fastest path to your language goals.
        </p>
        <a
          href="/assessment"
          className="mt-5 inline-block rounded-xl bg-teal-500 px-7 py-3.5 text-sm font-bold text-white transition hover:bg-teal-400"
        >
          Get My Personalized Plan
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your email"
        className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-teal-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={state === "loading"}
        className="rounded-xl bg-teal-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-teal-500 disabled:opacity-60"
      >
        {state === "loading" ? "Sending…" : "Get Instant Access"}
      </button>
      {state === "error" && (
        <p className="text-xs text-red-400 sm:col-span-2">Something went wrong. Try again.</p>
      )}
    </form>
  );
}
