import { cn } from "@/lib/utils";
import type { Stat } from "@/lib/types";

export default function StatCard({ stat }: { stat: Stat }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <p className="text-sm font-medium text-slate-500">{stat.label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        {stat.value}
      </p>
      {stat.change && (
        <p
          className={cn(
            "mt-1 text-xs font-medium",
            stat.trend === "up" && "text-emerald-600",
            stat.trend === "down" && "text-red-600",
            (!stat.trend || stat.trend === "flat") && "text-slate-500"
          )}
        >
          {stat.change}
        </p>
      )}
    </div>
  );
}
