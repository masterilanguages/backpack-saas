"use client";

import { useState } from "react";
import { useCompany } from "@/lib/useCompany";
import { useLocalStorage } from "@/lib/useLocalStorage";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ActionMenu from "@/components/ActionMenu";
import CreateModal from "@/components/CreateModal";
import { PlusIcon } from "@/components/Icons";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { ColumnDef, Transaction } from "@/lib/types";

export default function FinancesPage() {
  const company = useCompany();
  const [transactions, setTransactions] = useLocalStorage<Transaction[]>(
    "masteri-transactions",
    company.data.transactions
  );
  const [modalOpen, setModalOpen] = useState(false);

  const income = transactions
    .filter((t) => t.type === "Income" && t.status !== "Overdue")
    .reduce((sum, t) => sum + t.amount, 0);
  const expenses = transactions
    .filter((t) => t.type === "Expense")
    .reduce((sum, t) => sum + t.amount, 0);
  const outstanding = transactions
    .filter((t) => t.type === "Income" && (t.status === "Pending" || t.status === "Overdue"))
    .reduce((sum, t) => sum + t.amount, 0);

  const columns: ColumnDef<Transaction>[] = [
    { key: "date", header: "Date", render: (t) => formatDate(t.date) },
    {
      key: "description",
      header: "Description",
      render: (t) => <span className="font-medium text-slate-900">{t.description}</span>,
      className: "max-w-[320px] whitespace-normal",
    },
    { key: "category", header: "Category" },
    { key: "type", header: "Type", render: (t) => <StatusBadge status={t.type} /> },
    {
      key: "amount",
      header: "Amount",
      render: (t) => (
        <span
          className={cn(
            "font-semibold",
            t.type === "Income" ? "text-emerald-600" : "text-slate-900"
          )}
        >
          {t.type === "Income" ? "+" : "−"}
          {formatCurrency(t.amount, company.currency)}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
    {
      key: "id",
      header: "",
      render: (t) => (
        <ActionMenu
          items={[
            {
              label: "Delete",
              destructive: true,
              onClick: () => setTransactions((prev) => prev.filter((tx) => tx.id !== t.id)),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Finances"
        description={`Recent money in and out of ${company.name}.`}
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <PlusIcon /> Record transaction
          </button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          stat={{
            label: "Collected Income",
            value: formatCurrency(income, company.currency),
            change: "recent period",
            trend: "up",
          }}
        />
        <StatCard
          stat={{
            label: "Expenses",
            value: formatCurrency(expenses, company.currency),
            change: "recent period",
            trend: "flat",
          }}
        />
        <StatCard
          stat={{
            label: "Net",
            value: formatCurrency(income - expenses, company.currency),
            change: "income minus expenses",
            trend: income - expenses >= 0 ? "up" : "down",
          }}
        />
        <StatCard
          stat={{
            label: "Outstanding",
            value: formatCurrency(outstanding, company.currency),
            change: "pending + overdue invoices",
            trend: "down",
          }}
        />
      </div>

      <DataTable
        columns={columns}
        rows={transactions}
        searchKeys={["description", "category"]}
        searchPlaceholder="Search transactions..."
        filters={[
          { key: "type", label: "Types", options: ["Income", "Expense"] },
          { key: "status", label: "Statuses", options: ["Paid", "Pending", "Overdue"] },
        ]}
      />

      {modalOpen && (
        <CreateModal
          title="Record Transaction"
          fields={[
            { name: "description", label: "Description", required: true },
            { name: "amount", label: "Amount", required: true },
            { name: "type", label: "Type", type: "select", options: ["Income", "Expense"] },
            { name: "category", label: "Category" },
            { name: "status", label: "Status", type: "select", options: ["Paid", "Pending", "Overdue"] },
            { name: "date", label: "Date", type: "date" },
          ]}
          onSubmit={(data) => {
            const newTx: Transaction = {
              id: Date.now().toString(),
              description: data.description,
              amount: parseFloat(data.amount) || 0,
              type: (data.type as Transaction["type"]) ?? "Income",
              category: data.category ?? "",
              status: (data.status as Transaction["status"]) ?? "Pending",
              date: data.date ?? new Date().toISOString().slice(0, 10),
            };
            setTransactions((prev) => [newTx, ...prev]);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
