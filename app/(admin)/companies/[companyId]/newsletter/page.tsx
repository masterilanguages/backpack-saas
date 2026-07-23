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
  const [tab, setTab] = useState<"subscribers" | "compose" | "digest">("subscribers");

  // Personalized digest state
  const [digestEmail, setDigestEmail] = useState("");
  const [digestSending, setDigestSending] = useState<null | "test" | "all">(null);
  const [digestResult, setDigestResult] = useState<string | null>(null);

  const previewDigest = () => {
    const qs = digestEmail.trim() ? `?email=${encodeURIComponent(digestEmail.trim())}` : "";
    window.open(`/api/newsletter/digest${qs}`, "_blank", "noopener");
  };

  const sendDigest = async (mode: "test" | "all") => {
    if (mode === "all") {
      const ok = window.confirm(
        "Send a personalized digest to EVERY active learner? This sends real emails and cannot be undone."
      );
      if (!ok) return;
    }
    setDigestSending(mode);
    setDigestResult(null);
    try {
      const res = await fetch("/api/newsletter/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "test" ? { mode: "test", email: digestEmail.trim() } : { mode: "all" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDigestResult(`❌ ${data.error || "Send failed."}`);
      } else if (mode === "test") {
        setDigestResult(`✓ Test digest sent to ${data.to}.`);
      } else {
        setDigestResult(`✓ Sent ${data.sent}/${data.total} digests${data.failed ? ` · ${data.failed} failed` : ""}.`);
      }
    } catch {
      setDigestResult("❌ Network error.");
    } finally {
      setDigestSending(null);
    }
  };

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
        {(["subscribers", "compose", "digest"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-5 py-2 text-sm font-semibold capitalize transition ${
              tab === t ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "subscribers"
              ? `Subscribers (${subscribers.length})`
              : t === "compose"
                ? "Compose & Send"
                : "Personalized digest"}
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

      {tab === "digest" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Personalized daily digest</h3>
              <p className="mt-1 text-sm text-slate-500">
                Each learner gets their own email — the words they&apos;re building, lessons to
                continue, and new lessons in their language. Nothing is composed here; it&apos;s
                generated per learner.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Preview / test recipient
              </label>
              <input
                type="email"
                value={digestEmail}
                onChange={(e) => setDigestEmail(e.target.value)}
                placeholder="learner@example.com (defaults to you)"
                className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <p className="mt-1 text-xs text-slate-400">
                Leave blank to preview/test with your own account.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={previewDigest}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Preview in new tab
              </button>
              <button
                onClick={() => sendDigest("test")}
                disabled={digestSending !== null}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-40"
              >
                {digestSending === "test" ? "Sending…" : "Send test to me"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm space-y-3">
            <h3 className="text-base font-bold text-red-800">Send to all active learners</h3>
            <p className="text-sm text-red-700">
              Sends a real, personalized email to every learner with a profile and a language.
              Preview and test first.
            </p>
            <button
              onClick={() => sendDigest("all")}
              disabled={digestSending !== null}
              className="rounded-xl bg-red-600 px-6 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40"
            >
              {digestSending === "all" ? "Sending…" : "Send digest to all learners"}
            </button>
          </div>

          {digestResult && (
            <p className="text-sm font-medium text-slate-700">{digestResult}</p>
          )}
        </div>
      )}
    </div>
  );
}
