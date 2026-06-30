"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import NewLeadModal from "@/components/NewLeadModal";
import CreateModal from "@/components/CreateModal";
import ActionMenu from "@/components/ActionMenu";
import { PlusIcon } from "@/components/Icons";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ColumnDef } from "@/lib/types";

interface Lead {
  id: string;
  name: string;
  email: string;
  contact: string;
  source: string;
  value: number;
  status: string;
  owner: string;
  created_at: string;
}

export default function LeadsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);

  const onDelete = async (id: string) => {
    await fetch(`/api/school/${companyId}/leads`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setLeads((prev) => prev.filter((l) => l.id !== id));
  };

  useEffect(() => {
    fetch(`/api/school/${companyId}/leads`)
      .then((r) => r.json())
      .then(setLeads)
      .finally(() => setLoading(false));
  }, [companyId]);

  const columns: ColumnDef<Lead>[] = [
    {
      key: "name",
      header: "Lead",
      render: (lead) => (
        <div>
          <p className="font-medium text-slate-900">{lead.name}</p>
          <p className="text-xs text-slate-500">{lead.email}</p>
        </div>
      ),
    },
    { key: "contact", header: "Contact", render: (l) => l.contact ?? "—" },
    { key: "source", header: "Source", render: (l) => l.source ?? "—" },
    {
      key: "value",
      header: "Est. Value",
      render: (l) => <span className="font-medium text-slate-900">{formatCurrency(l.value ?? 0)}</span>,
    },
    { key: "status", header: "Status", render: (l) => <StatusBadge status={l.status} /> },
    { key: "owner", header: "Owner", render: (l) => l.owner ?? "—" },
    {
      key: "created_at",
      header: "Created",
      render: (l) =>
        l.created_at
          ? new Date(l.created_at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
          : "—",
    },
    {
      key: "id",
      header: "",
      render: (l) => (
        <ActionMenu
          items={[
            { label: "Edit", onClick: () => setEditing(l) },
            { label: "Delete", destructive: true, onClick: () => onDelete(l.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Incoming opportunities."
        actions={
          <button
            type="button"
            onClick={() => setNewLeadOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <PlusIcon /> New lead
          </button>
        }
      />
      <DataTable
        columns={columns}
        rows={leads}
        searchKeys={["name", "email", "contact", "source", "owner"]}
        searchPlaceholder="Search leads..."
        filters={[
          { key: "status", label: "Status", options: ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"] },
          { key: "source", label: "Source", options: Array.from(new Set(leads.map((l) => l.source).filter(Boolean))) },
        ]}
        emptyTitle="No leads yet"
        emptyDescription="Add your first lead to get started."
      />
      <NewLeadModal
        open={newLeadOpen}
        onClose={() => setNewLeadOpen(false)}
        onSubmit={async ({ firstName, lastName, phone, email }) => {
          const fullName = `${firstName} ${lastName}`.trim();
          const res = await fetch(`/api/school/${companyId}/leads`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: fullName,
              // el telefono va DENTRO de contact (la tabla leads no tiene columna phone)
              contact: phone ? `${fullName} · ${phone}` : fullName,
              email,
              source: "Manual",
              value: 0,
              status: "New",
              owner: "Mark",
            }),
          });
          const newLead = await res.json();
          if (newLead && newLead.id) setLeads((prev) => [newLead, ...prev]);
          setNewLeadOpen(false);
        }}
      />
      {editing && (
        <CreateModal
          title="Edit lead"
          submitLabel="Update"
          initialValues={{
            name: editing.name ?? "",
            email: editing.email ?? "",
            contact: editing.contact ?? "",
            source: editing.source ?? "",
            value: String(editing.value ?? 0),
            status: editing.status ?? "",
            owner: editing.owner ?? "",
          }}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "email", label: "Email" },
            { name: "contact", label: "Contact" },
            { name: "source", label: "Source" },
            { name: "value", label: "Est. value" },
            {
              name: "status",
              label: "Status",
              type: "select",
              options: ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"],
            },
            { name: "owner", label: "Owner" },
          ]}
          onSubmit={async (data) => {
            const value = parseFloat(data.value) || 0;
            await fetch(`/api/school/${companyId}/leads`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: editing.id, ...data, value }),
            });
            setLeads((prev) =>
              prev.map((x) => (x.id === editing.id ? { ...x, ...data, value } : x)),
            );
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
