"use client";

import { useState } from "react";
import { useCompany } from "@/lib/useCompany";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import NewLeadModal from "@/components/NewLeadModal";
import { PlusIcon } from "@/components/Icons";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ColumnDef, Lead } from "@/lib/types";

export default function LeadsPage() {
  const company = useCompany();
  const [leads, setLeads] = useState<Lead[]>(company.data.leads);
  const [newLeadOpen, setNewLeadOpen] = useState(false);

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
    { key: "contact", header: "Contact" },
    { key: "source", header: "Source" },
    {
      key: "value",
      header: "Est. Value",
      render: (lead) => (
        <span className="font-medium text-slate-900">
          {formatCurrency(lead.value, company.currency)}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (lead) => <StatusBadge status={lead.status} /> },
    { key: "owner", header: "Owner" },
    { key: "createdAt", header: "Created", render: (lead) => formatDate(lead.createdAt) },
  ];

  return (
    <div>
      <PageHeader
        title={company.labels.leads}
        description={`Incoming opportunities for ${company.name}.`}
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
        searchKeys={["name", "contact", "email", "source", "owner"]}
        searchPlaceholder="Search leads..."
        filters={[
          {
            key: "status",
            label: "Statuses",
            options: ["New", "Contacted", "Qualified", "Proposal Sent", "Won", "Lost"],
          },
          {
            key: "source",
            label: "Sources",
            options: Array.from(new Set(leads.map((l) => l.source))),
          },
        ]}
        emptyTitle="No leads match"
        emptyDescription="Try a different search term or clear the filters."
      />
      <NewLeadModal
        open={newLeadOpen}
        onClose={() => setNewLeadOpen(false)}
        onSubmit={({ firstName, lastName, phone, email }) => {
          const fullName = `${firstName} ${lastName}`.trim();
          const newLead: Lead = {
            id: `L-${Date.now()}`,
            name: fullName,
            contact: `${fullName} · ${phone}`,
            email,
            source: "Manual",
            value: 0,
            status: "New",
            owner: "Mark",
            createdAt: new Date().toISOString().slice(0, 10),
          };
          setLeads((prev) => [newLead, ...prev]);
        }}
      />
    </div>
  );
}
