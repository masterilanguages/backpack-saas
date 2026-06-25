"use client";

interface Props {
  onMenuClick: () => void;
}

export default function StudentTopbar({ onMenuClick }: Props) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-slate-800 bg-slate-900 px-4 sm:px-6 lg:hidden">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
        aria-label="Open menu"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <span className="text-sm font-semibold text-white">Masteri Languages</span>
    </header>
  );
}
