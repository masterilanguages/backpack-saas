"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { useCompany } from "@/lib/useCompany";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ActionMenu from "@/components/ActionMenu";
import CreateModal from "@/components/CreateModal";
import { PlusIcon, SearchIcon } from "@/components/Icons";
import { cn, formatDate } from "@/lib/utils";
function NoteCard({ note, onEdit, onDelete }: { note: { id: string; title: string; body: string; author: string; pinned: boolean; created_at: string }; onEdit: () => void; onDelete: () => void }) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border bg-white p-4 shadow-card",
        note.pinned ? "border-amber-300 bg-amber-50/40" : "border-slate-200"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          {note.pinned && <span className="mr-1.5 text-amber-500">★</span>}
          {note.title}
        </h3>
        <ActionMenu
          items={[
            { label: "Edit", onClick: onEdit },
            { label: "Delete", destructive: true, onClick: onDelete },
          ]}
        />
      </div>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{note.body}</p>
      <p className="mt-3 text-xs text-slate-400">
        {note.author} ·{" "}
        {note.created_at
          ? new Date(note.created_at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
          : "—"}
      </p>
    </div>
  );
}

interface Note {
  id: string; title: string; body: string; author: string; pinned: boolean; created_at: string;
}

export default function NotesPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const company = useCompany();
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);

  const deleteNote = async (id: string) => {
    await fetch(`/api/school/${companyId}/notes`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  useEffect(() => {
    fetch(`/api/school/${companyId}/notes`).then((r) => r.json()).then(setNotes);
  }, [companyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) =>
      n.title?.toLowerCase().includes(q) || n.body?.toLowerCase().includes(q) || n.author?.toLowerCase().includes(q)
    );
  }, [notes, search]);

  const pinned = filtered.filter((n) => n.pinned);
  const rest = filtered.filter((n) => !n.pinned);

  return (
    <div>
      <PageHeader
        title="Notes"
        description="Internal notes and reminders."
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <PlusIcon /> New note
          </button>
        }
      />

      <div className="relative mb-5 max-w-xs">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes..."
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No notes found"
          description="Try a different search term, or create the first note."
        />
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 && (
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Pinned
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {pinned.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onEdit={() => setEditing(note)}
                    onDelete={() => deleteNote(note.id)}
                  />
                ))}
              </div>
            </div>
          )}
          {rest.length > 0 && (
            <div>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                All notes
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {rest.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onEdit={() => setEditing(note)}
                    onDelete={() => deleteNote(note.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {modalOpen && (
        <CreateModal
          title="New Note"
          fields={[
            { name: "title", label: "Title", required: true },
            { name: "body", label: "Body", type: "textarea", required: true },
            { name: "author", label: "Author" },
          ]}
          onSubmit={async (data) => {
            const res = await fetch(`/api/school/${companyId}/notes`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            const note = await res.json();
            setNotes((prev) => [note, ...prev]);
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
      {editing && (
        <CreateModal
          title="Edit Note"
          submitLabel="Update"
          initialValues={{
            title: editing.title ?? "",
            body: editing.body ?? "",
            author: editing.author ?? "",
          }}
          fields={[
            { name: "title", label: "Title", required: true },
            { name: "body", label: "Body", type: "textarea", required: true },
            { name: "author", label: "Author" },
          ]}
          onSubmit={async (data) => {
            await fetch(`/api/school/${companyId}/notes`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: editing.id, ...data }),
            });
            setNotes((prev) => prev.map((n) => (n.id === editing.id ? { ...n, ...data } : n)));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
