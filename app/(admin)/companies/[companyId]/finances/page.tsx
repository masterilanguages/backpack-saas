"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import CreateModal from "@/components/CreateModal";
import { PlusIcon } from "@/components/Icons";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { ColumnDef } from "@/lib/types";

interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  type: string;
  amount: number;
  status: string;
}

export default function FinancesPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/school/${companyId}/transactions`)
      .then((r) => r.json())
      .then(setTransactions);
  }, [companyId]);

  const income = transactions.filter((t) => t.type === "Income" && t.status !== "Overdue").reduce((s, t) => s + t.amount, 0);
  const expenses = transactions.filter((t) => t.type === "Expense").reduce((s, t) => s + t.amount, 0);
  const outstanding = transactions.filter((t) => t.type === "Income" && (t.status === "Pending" || t.status === "Overdue")).reduce((s, t) => s + t.amount, 0);

  const columns: ColumnDef<Transaction>[] = [
    { key: "date", header: "Date", render: (t) => formatDate(t.date) },
    { key: "description", header: "Description", render: (t) => <span className="font-medium text-slate-900">{t.description}</span>, className: "max-w-[320px] whitespace-normal" },
    { key: "category", header: "Category", render: (t) => t.category ?? "—" },
    { key: "type", header: "Type", render: (t) => <StatusBadge status={t.type} /> },
    {
      key: "amount",
      header: "Amount",
      render: (t) => (
        <span className={cn("font-semibold", t.type === "Income" ? "text-emerald-600" : "text-slate-900")}>
          {t.type === "Income" ? "+" : "−"}{formatCurrency(t.amount)}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (t) => <StatusBadge status={t.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title="Finances"
        description="Money in and out."
        actions={
          <button type="button" onClick={() => setModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700">
            <PlusIcon /> Record transaction
          </button>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard stat={{ label: "Collected Income", value: formatCurrency(income), trend: "up" }} />
        <StatCard stat={{ label: "Expenses", value: formatCurrency(expenses), trend: "flat" }} />
        <StatCard stat={{ label: "Net", value: formatCurrency(income - expenses), trend: income - expenses >= 0 ? "up" : "down" }} />
        <StatCard stat={{ label: "Outstanding", value: formatCurrency(outstanding), trend: "down" }} />
      </div>
      <DataTable
        columns={columns}
        rows={transactions}
        searchKeys={["description", "category"]}
        searchPlaceholder="Search transactions..."
        filters={[
          { key: "type", label: "Type", options: ["Income", "Expense"] },
          { key: "status", label: "Status", options: ["Paid", "Pending", "Overdue"] },
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
          onSubmit={async (data) => {
            const res = await fetch(`/api/school/${companyId}/transactions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...data, amount: parseFloat(data.amount) || 0 }),
            });
            const newTx = await res.json();
            setTransactions((prev) => [newTx, ...prev]);
            setModalOpen(false);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
