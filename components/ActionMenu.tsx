"use client";

import { useEffect, useRef, useState } from "react";
import { DotsIcon } from "./Icons";
import { cn } from "@/lib/utils";

export interface ActionMenuItem {
  label: string;
  destructive?: boolean;
  onClick?: () => void;
}

const DEFAULT_ITEMS: ActionMenuItem[] = [
  { label: "View details" },
  { label: "Edit" },
  { label: "Delete", destructive: true },
];

export default function ActionMenu({
  items = DEFAULT_ITEMS,
}: {
  items?: ActionMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        aria-label="Row actions"
      >
        <DotsIcon />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-40 origin-top-right rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                item.onClick?.();
                setOpen(false);
              }}
              className={cn(
                "block w-full px-3 py-1.5 text-left text-sm transition hover:bg-slate-50",
                item.destructive ? "text-red-600" : "text-slate-700"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
