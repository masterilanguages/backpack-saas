import { cn, statusTone } from "@/lib/utils";
import type { Tone } from "@/lib/types";

const TONE_CLASSES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  yellow: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  purple: "bg-violet-50 text-violet-700 ring-violet-600/20",
  orange: "bg-orange-50 text-orange-700 ring-orange-600/20",
  gray: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export default function StatusBadge({
  status,
  tone,
}: {
  status: string;
  tone?: Tone;
}) {
  const resolved = tone ?? statusTone(status);
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONE_CLASSES[resolved]
      )}
    >
      {status}
    </span>
  );
}
