"use client";

import { useState } from "react";
import { useCompany } from "@/lib/useCompany";
import { useLocalStorage } from "@/lib/useLocalStorage";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ActionMenu from "@/components/ActionMenu";
import CreateModal from "@/components/CreateModal";
import { PlusIcon } from "@/components/Icons";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Client, ColumnDef } from "@/lib/types";

export default function ClientsPage() {
  const company = useCompany();
  const [clients, setClients] = useLocalStorage<Client[]>("masteri-clients", company.data.clients);
  const [modalOpen, setModalOpen] = useState(false);
  const singular = company.labels.clients.replace(/s$/, "").toLowerCase();

  const columns: ColumnDef<Client>[] = [
    {
      key: "name",
      header: company.labels.clients.replace(/s$/, ""),
      render: (client) => (
        <div>
          <p className="font-medium text-slate-900">{client.name}</p>
          <p className="text-xs text-slate-500">{client.email}</p>
        </div>
      ),
    },
    ...(company.clientMetaColumns ?? []).map<ColumnDef<Client>>((meta) => ({
      key: meta.key,
      header: meta.header,
      render: (client) => client.meta?.[meta.key] ?? "—",
    })),
    { key: "phone", header: "Phone" },
    { key: "since", header: "Since", render: (client) => formatDate(client.since) },
    {
      key: "totalValue",
      header: "Lifetime Value",
      render: (client) => (
        <span className="font-medium text-slate-900">
          {formatCurrency(client.totalValue, company.currency)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (client) => <StatusBadge status={client.status} />,
    },
    {
      key: "id",
      header: "",
      render: (client) => (
        <ActionMenu
          items={[
            {
              label: "Delete",
              destructive: true,
              onClick: () => setClients((prev) => prev.filter((c) => c.id !== client.id)),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={company.labels.clients}
        description={`Everyone ${company.name} currently works with.`}
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <PlusIcon /> Add {singular}
          </button>
        }
      />
      <DataTable
        columns={columns}
        rows={clients}
        searchKeys={["name", "contact", "email", "phone"]}
        searchPlaceholder={`Search ${company.labels.clients.toLowerCase()}...`}
        filters={[
          { key: "status", label: "Statuses", options: ["Active", "Paused", "Churned"] },
        ]}
      />
      {modalOpen && (
        <CreateModal
          title={`Add ${singular}`}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "email", label: "Email" },
            { name: "phone", label: "Phone" },
            { name: "status", label: "Status", type: "select", options: ["Active", "Paused", "Inactive"] },
          ]}
          onSubmit={(data) => {
            const newClient: Client = {
              id: Date.now().toString(),
              name: data.name,
              contact: data.name,
              email: data.email ?? "",
              phone: data.phone ?? "",
              since: new Date().toISOString().slice(0, 10),
              totalValue: 0,
              status: (data.status as Client["status"]) ?? "Active",
            };
            setClients((prev) => [newClient, ...prev]);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
