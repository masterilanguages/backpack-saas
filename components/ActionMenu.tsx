"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const MENU_WIDTH = 160; // w-40

export default function ActionMenu({
  items = DEFAULT_ITEMS,
}: {
  items?: ActionMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    // cerrar al hacer scroll (el menú es fixed y no seguiría a la fila)
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: Math.max(8, r.right - MENU_WIDTH) });
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        aria-label="Row actions"
      >
        <DotsIcon />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="z-50 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
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
          </div>,
          document.body
        )}
    </>
  );
}
