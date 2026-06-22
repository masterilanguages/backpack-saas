"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CloseIcon } from "@/components/Icons";

export type NewLeadInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
};

const EMPTY_FORM: NewLeadInput = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
};

export default function NewLeadModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (lead: NewLeadInput) => void;
}) {
  const [form, setForm] = useState<NewLeadInput>(EMPTY_FORM);

  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function updateField<K extends keyof NewLeadInput>(key: K, value: NewLeadInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(form);
    onClose();
  }

  const fieldClass =
    "mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-lead-title"
        className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="new-lead-title" className="text-lg font-semibold text-slate-900">
              New lead
            </h2>
            <p className="mt-1 text-sm text-slate-500">Add contact details for a new lead.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              First name
              <input
                type="text"
                required
                autoComplete="given-name"
                value={form.firstName}
                onChange={(e) => updateField("firstName", e.target.value)}
                className={fieldClass}
                placeholder="First name"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Last name
              <input
                type="text"
                required
                autoComplete="family-name"
                value={form.lastName}
                onChange={(e) => updateField("lastName", e.target.value)}
                className={fieldClass}
                placeholder="Last name"
              />
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Phone number
            <input
              type="tel"
              required
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => updateField("phone", e.target.value)}
              className={fieldClass}
              placeholder="Phone number"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={(e) => updateField("email", e.target.value)}
              className={fieldClass}
              placeholder="Email address"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Add lead
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
