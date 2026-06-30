"use client";
import { useState } from "react";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "select" | "textarea" | "date";
  options?: string[];
  required?: boolean;
};

export default function CreateModal({
  title,
  fields,
  onSubmit,
  onClose,
  initialValues,
  submitLabel = "Save",
  onFieldChange,
}: {
  title: string;
  fields: FieldDef[];
  onSubmit: (data: Record<string, string>) => void;
  onClose: () => void;
  initialValues?: Record<string, string>;
  submitLabel?: string;
  /** Opcional: al cambiar un campo, devuelve overrides para DERIVAR otros
   *  (p.ej. al elegir Student, autocompletar Coach). */
  onFieldChange?: (
    name: string,
    value: string,
    form: Record<string, string>,
  ) => Record<string, string> | void;
}) {
  const [form, setForm] = useState<Record<string, string>>(initialValues ?? {});

  const handleChange = (name: string, value: string) => {
    setForm((p) => {
      let next = { ...p, [name]: value };
      if (onFieldChange) {
        const extra = onFieldChange(name, value, next);
        if (extra) next = { ...next, ...extra };
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          {fields.map((f) => (
            <div key={f.name}>
              <label className="mb-1 block text-xs font-medium text-slate-600">{f.label}</label>
              {f.type === "select" ? (
                <select
                  required={f.required}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form[f.name] ?? ""}
                  onChange={(e) => handleChange(f.name, e.target.value)}
                >
                  <option value="">Select…</option>
                  {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  required={f.required}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form[f.name] ?? ""}
                  onChange={(e) => handleChange(f.name, e.target.value)}
                />
              ) : (
                <input
                  type={f.type ?? "text"}
                  required={f.required}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={form[f.name] ?? ""}
                  onChange={(e) => handleChange(f.name, e.target.value)}
                />
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">{submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
