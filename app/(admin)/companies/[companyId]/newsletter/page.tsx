"use client";

import { useState } from "react";
import { useLocalStorage } from "@/lib/useLocalStorage";
import PageHeader from "@/components/PageHeader";

export default function NewsletterPage() {
  const [subscribers, setSubscribers] = useLocalStorage<string[]>("masteri-newsletter-subscribers", []);
  const [newEmail, setNewEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [tab, setTab] = useState<"subscribers" | "compose">("subscribers");

  const addEmail = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email.includes("@") || subscribers.includes(email)) return;
    setSubscribers((prev) => [...prev, email]);
    setNewEmail("");
  };

  const removeEmail = (email: string) => {
    setSubscribers((prev) => prev.filter((e) => e !== email));
  };

  const handleSend = async () => {
    if (!subject || !body || subscribers.length === 0) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/newsletter/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscribers, subject, body }),
      });
      const data = await res.json();
      setResult(data);
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Newsletter"
        description={`${subscribers.length} subscriber${subscribers.length !== 1 ? "s" : ""}`}
      />

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 w-fit">
        {(["subscribers", "compose"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-5 py-2 text-sm font-semibold capitalize transition ${
              tab === t ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "subscribers" ? `Subscribers (${subscribers.length})` : "Compose & Send"}
          </button>
        ))}
      </div>

      {tab === "subscribers" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Add email */}
          <div className="flex gap-3 border-b border-slate-100 p-4">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEmail()}
              placeholder="Add email address..."
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <button
              onClick={addEmail}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Add
            </button>
          </div>

          {/* List */}
          {subscribers.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-400">No subscribers yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {subscribers.map((email) => (
                <li key={email} className="flex items-center justify-between px-5 py-3">
                  <span className="text-sm text-slate-800">{email}</span>
                  <button
                    onClick={() => removeEmail(email)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "compose" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-500 uppercase tracking-wide">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Your email subject..."
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-500 uppercase tracking-wide">Body</label>
              <textarea
                rows={14}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your newsletter here..."
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleSend}
              disabled={sending || !subject || !body || subscribers.length === 0}
              className="rounded-xl bg-teal-600 px-6 py-3 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-40 transition"
            >
              {sending ? "Sending…" : `Send to ${subscribers.length} subscriber${subscribers.length !== 1 ? "s" : ""}`}
            </button>
            {subscribers.length === 0 && (
              <p className="text-sm text-slate-400">Add subscribers first.</p>
            )}
            {result && (
              <p className="text-sm text-slate-600">
                ✓ Sent: <strong>{result.sent}</strong>
                {result.failed > 0 && ` · Failed: ${result.failed}`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
