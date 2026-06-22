"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const VIEWPORTS = [
  { id: "desktop", label: "Desktop", width: "100%" },
  { id: "tablet", label: "Tablet", width: "768px" },
  { id: "mobile", label: "Mobile", width: "390px" },
] as const;

type ViewportId = (typeof VIEWPORTS)[number]["id"];

export default function LandingPagePreview({
  src,
  sourceFile,
}: {
  src: string;
  sourceFile: string;
}) {
  const [viewport, setViewport] = useState<ViewportId>("desktop");
  const [reloadKey, setReloadKey] = useState(0);
  const active = VIEWPORTS.find((v) => v.id === viewport)!;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          {VIEWPORTS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setViewport(v.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition",
                viewport === v.id
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Reload preview
          </button>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Open live page ↗
          </a>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
        Edit the page source at <code className="rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-slate-700">{sourceFile}</code> — changes hot-reload here automatically.
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-200/60 p-3 sm:p-6">
        <div
          className="mx-auto overflow-hidden rounded-lg border border-slate-300 bg-white shadow-lg transition-all duration-200"
          style={{ width: active.width, maxWidth: "100%" }}
        >
          <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-100 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="ml-3 flex-1 truncate rounded bg-white px-2 py-0.5 text-[11px] text-slate-400">
              {src}
            </span>
          </div>
          <iframe
            key={`${viewport}-${reloadKey}`}
            src={src}
            title="Landing page preview"
            className="h-[70vh] w-full bg-white"
          />
        </div>
      </div>
    </div>
  );
}
