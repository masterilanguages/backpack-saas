"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ActionMenu from "@/components/ActionMenu";
import { PlusIcon } from "@/components/Icons";
import { formatDate } from "@/lib/utils";
import type { ColumnDef, Tone } from "@/lib/types";

interface FileRow {
  id: string;
  name: string;
  type: string;
  size: string | null;
  owner: string | null;
  storage_path: string | null;
  created_at: string;
  url: string | null;
}

const TYPE_TONES: Record<string, Tone> = {
  PDF: "red",
  Image: "purple",
  Doc: "blue",
  Sheet: "green",
  Video: "orange",
  Audio: "yellow",
  Archive: "gray",
};

export default function FilesPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/school/${companyId}/files`)
      .then((r) => r.json())
      .then((d) => setFiles(Array.isArray(d) ? d : []))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [companyId]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/school/${companyId}/files`, { method: "POST", body: fd });
      const created = await res.json();
      if (created && created.id) setFiles((prev) => [{ ...created, url: null }, ...prev]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDelete = async (f: FileRow) => {
    await fetch(`/api/school/${companyId}/files`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: f.id, storage_path: f.storage_path }),
    });
    setFiles((prev) => prev.filter((x) => x.id !== f.id));
  };

  const columns: ColumnDef<FileRow>[] = [
    {
      key: "name",
      header: "File",
      className: "max-w-[320px] truncate",
      render: (f) =>
        f.url ? (
          <a href={f.url} target="_blank" rel="noreferrer" className="font-medium text-teal-700 hover:underline">
            {f.name}
          </a>
        ) : (
          <span className="font-medium text-slate-900">{f.name}</span>
        ),
    },
    {
      key: "type",
      header: "Type",
      render: (f) => <StatusBadge status={f.type} tone={TYPE_TONES[f.type] ?? "gray"} />,
    },
    { key: "size", header: "Size", render: (f) => f.size ?? "—" },
    { key: "owner", header: "Owner", render: (f) => f.owner ?? "—" },
    { key: "created_at", header: "Modified", render: (f) => formatDate(f.created_at) },
    {
      key: "id",
      header: "",
      render: (f) => (
        <ActionMenu
          items={[
            ...(f.url ? [{ label: "Download", onClick: () => window.open(f.url!, "_blank") }] : []),
            { label: "Delete", destructive: true, onClick: () => onDelete(f) },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <input ref={inputRef} type="file" className="hidden" onChange={onUpload} />
      <PageHeader
        title="Files"
        description="Documents and media."
        actions={
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
          >
            <PlusIcon /> {uploading ? "Uploading…" : "Upload file"}
          </button>
        }
      />
      {loading ? (
        <p className="px-1 py-8 text-sm text-slate-400">Cargando…</p>
      ) : (
        <DataTable<FileRow>
          columns={columns}
          rows={files}
          searchKeys={["name", "owner"]}
          searchPlaceholder="Search files..."
          filters={[
            { key: "type", label: "Types", options: Array.from(new Set(files.map((f) => f.type))) },
          ]}
          emptyTitle="No files yet"
          emptyDescription="Sube tu primer archivo con 'Upload file'."
        />
      )}
    </div>
  );
}
