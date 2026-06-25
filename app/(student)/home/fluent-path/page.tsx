"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, ChevronDown } from "lucide-react";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;

const WHATSAPP_NUMBER = "15551234567"; // replace with real number

const STEPS: any[] = [
  {
    id: "language",
    question: "What language do you want to become fluent in?",
    helper: "We'll personalize everything based on this.",
    type: "text",
    placeholder: "e.g. Hebrew, Spanish, French…",
  },
  {
    id: "motivation",
    question: "What's motivating you to learn this language right now?",
    helper: "People who are clear on their 'why' progress faster.",
    type: "select",
    options: [
      { value: "Travel / lifestyle", emoji: "✈️" },
      { value: "Career / business", emoji: "💼" },
      { value: "Relationships / family", emoji: "❤️" },
      { value: "Personal growth", emoji: "🌱" },
      { value: "I've always wanted this", emoji: "⭐" },
    ],
  },
  {
    id: "why_important",
    question: "Why is this important to you?",
    helper: "Take a moment — this helps us tailor your path.",
    type: "textarea",
    placeholder: "Be honest with yourself…",
  },
  {
    id: "current_level",
    question: "Where are you right now?",
    type: "select",
    options: [
      { value: "Beginner (0–10%)", emoji: "🌱" },
      { value: "Basic (10–30%)", emoji: "📗" },
      { value: "Intermediate (30–60%)", emoji: "📘" },
      { value: "Almost fluent (60%+)", emoji: "🔥" },
    ],
  },
  {
    id: "goal_level",
    question: "Where do you want to be?",
    helper: "Fluency means speaking freely without translating.",
    type: "select",
    options: [
      { value: "Basic conversations", emoji: "💬" },
      { value: "Confident speaking", emoji: "🎤" },
      { value: "Fully fluent (70%+)", emoji: "🏆" },
    ],
  },
  {
    id: "frustration",
    question: "What's the most frustrating part right now?",
    type: "select",
    options: [
      { value: "I understand but can't speak", emoji: "🤐" },
      { value: "I forget everything", emoji: "😮‍💨" },
      { value: "I feel stuck", emoji: "🧱" },
      { value: "I don't have structure", emoji: "🗺️" },
      { value: "I don't practice consistently", emoji: "⏰" },
    ],
  },
  {
    id: "tried_before",
    question: "What have you already tried?",
    type: "select",
    multi: true,
    options: [
      { value: "Apps (Duolingo, etc.)", emoji: "📱" },
      { value: "Classes / school", emoji: "🏫" },
      { value: "Tutors", emoji: "👩‍🏫" },
      { value: "Self-study", emoji: "📚" },
      { value: "Nothing serious yet", emoji: "🤷" },
    ],
  },
  {
    id: "why_didnt_work",
    question: "Why do you think that didn't work?",
    type: "textarea",
    placeholder: "Be honest — no wrong answers here…",
  },
  {
    id: "learning_duration",
    question: "How long have you been trying to learn?",
    helper: "Most people spend years without becoming conversational.",
    type: "select",
    options: [
      { value: "Less than 3 months", emoji: "🌿" },
      { value: "3–12 months", emoji: "📅" },
      { value: "1–3 years", emoji: "🗓️" },
      { value: "3+ years", emoji: "⌛" },
    ],
  },
  {
    id: "fluency_impact",
    question: "If you became fluent… what would change for you?",
    type: "textarea",
    placeholder: "Paint the picture clearly…",
  },
  {
    id: "why_now",
    question: "Why is now the time to make this a priority?",
    type: "textarea",
    placeholder: "What's different about now?",
  },
  {
    id: "ready_to_commit",
    question: "Are you ready to commit time daily to become fluent?",
    type: "select",
    options: [
      { value: "Yes — I'm ready", emoji: "✅" },
      { value: "I can try", emoji: "🙏" },
      { value: "Not sure yet", emoji: "🤔" },
    ],
  },
  {
    id: "daily_time",
    question: "Can you realistically commit 60–90 minutes per day?",
    type: "select",
    options: [
      { value: "Yes", emoji: "✅" },
      { value: "Maybe", emoji: "🤞" },
      { value: "No", emoji: "❌" },
    ],
  },
  {
    id: "ready_to_move",
    question: "If we show you a clear path to fluency, are you ready to move forward?",
    type: "select",
    options: [
      { value: "Yes — ready to start", emoji: "🚀" },
      { value: "I want to review options", emoji: "🔍" },
      { value: "Just exploring", emoji: "👀" },
    ],
  },
  {
    id: "contact",
    question: "Where should we send your personalized plan?",
    helper: "We'll only reach out with relevant next steps.",
    type: "contact",
  },
];

const pageVariants = {
  initial: { opacity: 0, y: 32 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, y: -24, transition: { duration: 0.22 } },
};

export default function FluentPath() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<any>({});
  const [contact, setContact] = useState({ first_name: "", phone: "", email: "" });
  const [textVal, setTextVal] = useState("");
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leadId, setLeadId] = useState<any>(null);
  const inputRef = useRef<any>(null);

  const current = STEPS[step];
  const progress = Math.round(((step) / STEPS.length) * 100);

  // Focus text input on step change
  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
    // Restore value for current step
    const existing = answers[current?.id];
    if (current?.type === "text" || current?.type === "textarea") {
      setTextVal(existing || "");
    } else if (current?.type === "select" && current?.multi) {
      setMultiSel(existing ? existing.split(" | ") : []);
    }
  }, [step]);

  const saveAnswer = async (field: string, value: any) => {
    const updated = { ...answers, [field]: value };
    setAnswers(updated);
    try {
      if (leadId) {
        await base44.entities.FluentLead.update(leadId, { [field]: value });
      } else {
        const created = await base44.entities.FluentLead.create({
          tag: "Language Fluency Lead",
          [field]: value,
        });
        setLeadId(created.id);
      }
    } catch (e) {
      // silent
    }
  };

  const goNext = async (value?: any) => {
    if (value !== undefined) {
      await saveAnswer(current.id, value);
    }
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    }
  };

  const goBack = () => {
    if (step > 0) setStep(s => s - 1);
  };

  const handleTextNext = () => {
    if (!textVal.trim()) return;
    goNext(textVal.trim());
  };

  const handleMultiNext = () => {
    if (!multiSel.length) return;
    goNext(multiSel.join(" | "));
  };

  const toggleMulti = (val: string) => {
    setMultiSel(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  const handleContactSubmit = async () => {
    if (!contact.first_name.trim() || !contact.email.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...answers,
        ...contact,
        tag: "Language Fluency Lead",
      };
      if (leadId) {
        await base44.entities.FluentLead.update(leadId, contact);
      } else {
        const created = await base44.entities.FluentLead.create(payload);
        setLeadId(created.id);
      }
      setSubmitted(true);
    } catch (e) {
      // silent
    }
    setSaving(false);
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16" style={{ background: "#0f0f0f" }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="max-w-md w-full text-center"
        >
          <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto mb-8">
            <Check className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-3xl font-semibold text-white mb-4" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>
            You're closer to fluency than you think.
          </h1>
          <p className="text-white/50 text-base leading-relaxed mb-10">
            We're reviewing your answers and preparing a personalized plan based on your goals and challenges.
            <br /><br />
            Most people never reach fluency because they lack structure and accountability — we fix that.
          </p>
          <div className="space-y-3">
            <a
              href="https://cal.com"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-4 rounded-2xl text-center font-semibold text-base transition-all"
              style={{ background: "linear-gradient(135deg, #c9a96e, #e8c98a)", color: "#0f0f0f" }}
            >
              Schedule Your Strategy Call
            </a>
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}?text=Hi! I just filled out the fluency form.`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-4 rounded-2xl border text-center font-semibold text-base transition-all text-white"
              style={{ borderColor: "rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)" }}
            >
              💬 Message Us on WhatsApp
            </a>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0f0f0f" }}>
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-50 h-1" style={{ background: "rgba(255,255,255,0.06)" }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg, #c9a96e, #e8c98a)" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>

      {/* Back button */}
      <div className="flex items-center justify-between px-6 pt-8 pb-2">
        <button
          onClick={goBack}
          className={`flex items-center gap-1.5 text-sm transition-all ${step === 0 ? "opacity-0 pointer-events-none" : "text-white/40 hover:text-white/70"}`}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <span className="text-white/20 text-xs">{step + 1} / {STEPS.length}</span>
      </div>

      {/* Header */}
      {step === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-6 pt-4 pb-2 text-center"
        >
          <p className="text-xs tracking-widest uppercase text-white/30 mb-3">Language Fluency Path</p>
          <h1 className="text-2xl font-medium text-white mb-2" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>
            Design Your Language Fluency Path
          </h1>
          <p className="text-white/40 text-sm max-w-xs mx-auto">
            Answer a few questions so we can map out your fastest path to becoming conversational.
          </p>
        </motion.div>
      )}

      {/* Step content */}
      <div className="flex-1 flex flex-col justify-center px-6 py-6 max-w-md mx-auto w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <h2
              className="text-2xl font-medium text-white mb-2 leading-snug"
              style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}
            >
              {current.question}
            </h2>
            {current.helper && (
              <p className="text-white/35 text-sm mb-6">{current.helper}</p>
            )}

            {/* TEXT input */}
            {current.type === "text" && (
              <div className="space-y-4 mt-6">
                <input
                  ref={inputRef}
                  type="text"
                  value={textVal}
                  onChange={e => setTextVal(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleTextNext()}
                  placeholder={current.placeholder}
                  className="w-full px-5 py-4 rounded-2xl text-base text-white placeholder-white/25 outline-none border transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", borderColor: textVal ? "rgba(201,169,110,0.6)" : "rgba(255,255,255,0.08)" }}
                />
                <button
                  onClick={handleTextNext}
                  disabled={!textVal.trim()}
                  className="w-full py-4 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-30"
                  style={{ background: "linear-gradient(135deg, #c9a96e, #e8c98a)", color: "#0f0f0f" }}
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* TEXTAREA */}
            {current.type === "textarea" && (
              <div className="space-y-4 mt-6">
                <textarea
                  ref={inputRef}
                  value={textVal}
                  onChange={e => setTextVal(e.target.value)}
                  placeholder={current.placeholder}
                  rows={4}
                  className="w-full px-5 py-4 rounded-2xl text-base text-white placeholder-white/25 outline-none border transition-all resize-none"
                  style={{ background: "rgba(255,255,255,0.05)", borderColor: textVal ? "rgba(201,169,110,0.6)" : "rgba(255,255,255,0.08)" }}
                />
                <button
                  onClick={handleTextNext}
                  disabled={!textVal.trim()}
                  className="w-full py-4 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-30"
                  style={{ background: "linear-gradient(135deg, #c9a96e, #e8c98a)", color: "#0f0f0f" }}
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* SELECT (single, auto-advance) */}
            {current.type === "select" && !current.multi && (
              <div className="space-y-2.5 mt-6">
                {current.options.map((opt: any) => (
                  <motion.button
                    key={opt.value}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => goNext(opt.value)}
                    className="w-full px-5 py-4 rounded-2xl text-left flex items-center gap-4 text-white text-base font-medium transition-all border"
                    style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = "rgba(201,169,110,0.12)";
                      e.currentTarget.style.borderColor = "rgba(201,169,110,0.4)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                    }}
                  >
                    <span className="text-xl w-7 text-center flex-shrink-0">{opt.emoji}</span>
                    <span>{opt.value}</span>
                  </motion.button>
                ))}
              </div>
            )}

            {/* SELECT multi */}
            {current.type === "select" && current.multi && (
              <div className="space-y-2.5 mt-6">
                {current.options.map((opt: any) => {
                  const selected = multiSel.includes(opt.value);
                  return (
                    <motion.button
                      key={opt.value}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => toggleMulti(opt.value)}
                      className="w-full px-5 py-4 rounded-2xl text-left flex items-center gap-4 text-white text-base font-medium transition-all border"
                      style={{
                        background: selected ? "rgba(201,169,110,0.14)" : "rgba(255,255,255,0.04)",
                        borderColor: selected ? "rgba(201,169,110,0.55)" : "rgba(255,255,255,0.08)",
                      }}
                    >
                      <span className="text-xl w-7 text-center flex-shrink-0">{opt.emoji}</span>
                      <span className="flex-1">{opt.value}</span>
                      {selected && <Check className="w-4 h-4 text-yellow-400 flex-shrink-0" />}
                    </motion.button>
                  );
                })}
                <button
                  onClick={handleMultiNext}
                  disabled={!multiSel.length}
                  className="w-full py-4 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-all disabled:opacity-30 mt-4"
                  style={{ background: "linear-gradient(135deg, #c9a96e, #e8c98a)", color: "#0f0f0f" }}
                >
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* CONTACT */}
            {current.type === "contact" && (
              <div className="space-y-3 mt-6">
                {current.helper && !step && null}
                <input
                  type="text"
                  value={contact.first_name}
                  onChange={e => setContact(c => ({ ...c, first_name: e.target.value }))}
                  placeholder="First name"
                  className="w-full px-5 py-4 rounded-2xl text-base text-white placeholder-white/25 outline-none border transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", borderColor: contact.first_name ? "rgba(201,169,110,0.6)" : "rgba(255,255,255,0.08)" }}
                />
                <input
                  type="tel"
                  value={contact.phone}
                  onChange={e => setContact(c => ({ ...c, phone: e.target.value }))}
                  placeholder="Phone number"
                  className="w-full px-5 py-4 rounded-2xl text-base text-white placeholder-white/25 outline-none border transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", borderColor: contact.phone ? "rgba(201,169,110,0.6)" : "rgba(255,255,255,0.08)" }}
                />
                <input
                  type="email"
                  value={contact.email}
                  onChange={e => setContact(c => ({ ...c, email: e.target.value }))}
                  placeholder="Email address"
                  className="w-full px-5 py-4 rounded-2xl text-base text-white placeholder-white/25 outline-none border transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", borderColor: contact.email ? "rgba(201,169,110,0.6)" : "rgba(255,255,255,0.08)" }}
                />
                <p className="text-white/25 text-xs text-center pt-1">{current.helper}</p>
                <button
                  onClick={handleContactSubmit}
                  disabled={saving || !contact.first_name.trim() || !contact.email.trim()}
                  className="w-full py-4 rounded-2xl font-semibold text-base transition-all disabled:opacity-30 mt-2"
                  style={{ background: "linear-gradient(135deg, #c9a96e, #e8c98a)", color: "#0f0f0f" }}
                >
                  {saving ? "Sending…" : "Get My Personalized Plan →"}
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
