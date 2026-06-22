"use client";

import { useCompany } from "@/lib/useCompany";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import { PlusIcon } from "@/components/Icons";
import { formatDate } from "@/lib/utils";
import type { ColumnDef, FileRecord, Tone } from "@/lib/types";

const TYPE_TONES: Record<FileRecord["type"], Tone> = {
  PDF: "red",
  Image: "purple",
  Doc: "blue",
  Sheet: "green",
  Video: "orange",
  Audio: "yellow",
  Archive: "gray",
};

export default function FilesPage() {
  const company = useCompany();
  const files = company.data.files;

  const columns: ColumnDef<FileRecord>[] = [
    {
      key: "name",
      header: "File",
      render: (file) => <span className="font-medium text-slate-900">{file.name}</span>,
      className: "max-w-[320px] truncate",
    },
    {
      key: "type",
      header: "Type",
      render: (file) => <StatusBadge status={file.type} tone={TYPE_TONES[file.type]} />,
    },
    { key: "size", header: "Size" },
    { key: "owner", header: "Owner" },
    { key: "modified", header: "Modified", render: (file) => formatDate(file.modified) },
  ];

  return (
    <div>
      <PageHeader
        title="Files"
        description={`Documents and media for ${company.name}.`}
        actions={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <PlusIcon /> Upload file
          </button>
        }
      />
      <DataTable
        columns={columns}
        rows={files}
        searchKeys={["name", "owner"]}
        searchPlaceholder="Search files..."
        filters={[
          {
            key: "type",
            label: "Types",
            options: Array.from(new Set(files.map((f) => f.type))),
          },
        ]}
      />
    </div>
  );
}
