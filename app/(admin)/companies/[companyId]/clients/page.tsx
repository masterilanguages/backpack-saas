"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ActionMenu from "@/components/ActionMenu";
import CreateModal from "@/components/CreateModal";
import { PlusIcon } from "@/components/Icons";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { ColumnDef } from "@/lib/types";

interface StudentProgress {
  hasProfile: boolean;
  language: string | null;
  day: number | null;
  xp: number | null;
  streak: number | null;
  words: number;
  journal: number;
  lastActive: string | null;
}

interface Student {
  id: string;
  name: string;
  email: string;
  phone: string;
  language: string;
  level: string;
  since: string;
  total_value: number;
  status: string;
  progress?: StudentProgress;
}

export default function ClientsPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [accountInfo, setAccountInfo] = useState<{
    email: string;
    tempPassword: string | null;
    created: boolean;
    alreadyExisted: boolean;
    error?: string;
  } | null>(null);

  useEffect(() => {
    fetch(`/api/school/${companyId}/students`)
      .then((r) => r.json())
      .then(setStudents)
      .finally(() => setLoading(false));
  }, [companyId]);

  const columns: ColumnDef<Student>[] = [
    {
      key: "name",
      header: "Student",
      render: (s) => (
        <div>
          <p className="font-medium text-slate-900">{s.name}</p>
          <p className="text-xs text-slate-500">{s.email}</p>
        </div>
      ),
    },
    { key: "language", header: "Idioma", render: (s) => s.progress?.language ?? s.language ?? "—" },
    {
      key: "words",
      header: "Palabras",
      render: (s) => <span className="font-medium text-slate-900">{s.progress?.words ?? 0}</span>,
    },
    { key: "journal", header: "Journal", render: (s) => s.progress?.journal ?? 0 },
    {
      key: "day",
      header: "Progreso",
      render: (s) => (s.progress?.day != null ? `Día ${s.progress.day}` : "—"),
    },
    {
      key: "perfil",
      header: "Perfil",
      render: (s) =>
        s.progress?.hasProfile ? (
          <StatusBadge status="Activo" tone="green" />
        ) : (
          <span className="text-xs text-slate-400">Sin perfil</span>
        ),
    },
    { key: "status", header: "Status", render: (s) => <StatusBadge status={s.status} /> },
    {
      key: "id",
      header: "",
      render: (s) => (
        <ActionMenu
          items={[
            {
              label: "View details",
              onClick: () => router.push(`/companies/${companyId}/clients/${s.id}`),
            },
            {
              label: "Edit",
              onClick: () => setEditing(s),
            },
            {
              label: "Delete",
              destructive: true,
              onClick: async () => {
                await fetch(`/api/school/${companyId}/students`, {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: s.id }),
                });
                setStudents((prev) => prev.filter((x) => x.id !== s.id));
              },
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Students"
        description="Everyone currently enrolled."
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <PlusIcon /> Add student
          </button>
        }
      />
      <DataTable
        columns={columns}
        rows={students}
        searchKeys={["name", "email", "phone", "language"]}
        searchPlaceholder="Search students..."
        filters={[
          { key: "status", label: "Status", options: ["Active", "Paused", "Churned", "Trial"] },
          { key: "language", label: "Language", options: Array.from(new Set(students.map((s) => s.language).filter(Boolean))) },
        ]}
      />
      {modalOpen && (
        <CreateModal
          title="Add student"
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "email", label: "Email" },
            { name: "phone", label: "Phone" },
            { name: "language", label: "Language" },
            { name: "level", label: "Level", type: "select", options: ["Complete Beginner", "Beginner", "Intermediate", "Advanced"] },
            { name: "status", label: "Status", type: "select", options: ["Active", "Trial", "Paused", "Churned"] },
          ]}
          onSubmit={async (data) => {
            const res = await fetch(`/api/school/${companyId}/students`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            const newStudent = await res.json();
            setStudents((prev) => [newStudent, ...prev]);
            setModalOpen(false);
            // Muestra el resultado de la cuenta en un panel propio (con copiar),
            // no en un alert nativo del navegador.
            if (newStudent._account) setAccountInfo(newStudent._account);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
      {editing && (
        <CreateModal
          title="Edit student"
          submitLabel="Update"
          initialValues={{
            name: editing.name ?? "",
            email: editing.email ?? "",
            phone: editing.phone ?? "",
            language: editing.language ?? "",
            level: editing.level ?? "",
            status: editing.status ?? "",
          }}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "email", label: "Email" },
            { name: "phone", label: "Phone" },
            { name: "language", label: "Language" },
            { name: "level", label: "Level", type: "select", options: ["Complete Beginner", "Beginner", "Intermediate", "Advanced"] },
            { name: "status", label: "Status", type: "select", options: ["Active", "Trial", "Paused", "Churned"] },
          ]}
          onSubmit={async (data) => {
            const res = await fetch(`/api/school/${companyId}/students`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: editing.id, ...data }),
            });
            const updated = await res.json();
            setStudents((prev) => prev.map((x) => (x.id === editing.id ? { ...x, ...updated } : x)));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {accountInfo && (
        <AccountCreatedModal account={accountInfo} onClose={() => setAccountInfo(null)} />
      )}
    </div>
  );
}

// ── Panel de cuenta creada ─────────────────────────────────────────────────────
// Reemplaza al window.alert: muestra las credenciales DENTRO de la interfaz, con
// botones para copiar el email y la contraseña temporal (que el alumno cambiará).

function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = value;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition ${
        copied
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {copied ? "✓ Copiado" : label}
    </button>
  );
}

function CredentialRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className={`w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 ${
            mono ? "font-mono" : ""
          }`}
        />
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function AccountCreatedModal({
  account,
  onClose,
}: {
  account: { email: string; tempPassword: string | null; created: boolean; alreadyExisted: boolean; error?: string };
  onClose: () => void;
}) {
  const ok = account.created && account.tempPassword;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {ok ? (
          <>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-600">
                ✓
              </span>
              <h3 className="text-lg font-bold text-slate-900">Cuenta creada</h3>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Comparte estas credenciales con el alumno. Deberá cambiar la contraseña al entrar a su portal.
            </p>
            <div className="mt-4 space-y-3">
              <CredentialRow label="Email" value={account.email} />
              <CredentialRow label="Contraseña temporal" value={account.tempPassword!} mono />
            </div>
            <div className="mt-5 flex items-center justify-between">
              <CopyButton
                value={`Email: ${account.email}\nContraseña temporal: ${account.tempPassword}`}
                label="Copiar ambas"
              />
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Listo
              </button>
            </div>
          </>
        ) : account.alreadyExisted ? (
          <>
            <h3 className="text-lg font-bold text-slate-900">Alumno vinculado</h3>
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium">{account.email}</span> ya tenía una cuenta; se vinculó a esta escuela. Entra
              con su contraseña actual (no se generó una nueva).
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Entendido
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-slate-900">Se agregó al roster</h3>
            <p className="mt-2 text-sm text-slate-600">
              El alumno quedó en la lista, pero la cuenta de acceso no se pudo crear
              {account.error ? `: ${account.error}` : "."}
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
