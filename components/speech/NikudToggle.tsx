"use client";

// Platform nikkud button. Render it only while the Hebrew transliteration
// view is open. The choice is stored for the whole device (useNikudPreference),
// so every school screen that shows Hebrew next to phonetics follows it.

import { useNikudPreference } from "@/lib/speech/useNikud";

export default function NikudToggle({
  visible = true,
  className = "",
}: {
  visible?: boolean;
  className?: string;
}) {
  const [mode, setMode] = useNikudPreference();
  if (!visible) return null;
  const on = mode === "on";
  return (
    <button
      type="button"
      aria-pressed={on}
      data-state={on ? "on" : "off"}
      title={on ? "Hide nikkud" : "Show nikkud"}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setMode(on ? "off" : "on");
      }}
      className={`inline-flex h-7 items-center justify-center rounded-full px-2 text-xs font-bold transition ${
        on ? "bg-teal-500 text-white" : "bg-white/15 text-current"
      } ${className}`}
    >
      {on ? "נִקּוּד" : "ניקוד"}
    </button>
  );
}
