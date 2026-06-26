"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import DataTable from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import CreateModal from "@/components/CreateModal";
import { PlusIcon } from "@/components/Icons";
import type { ColumnDef } from "@/lib/types";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "backpacksystems.com";

/**
 * PLATFORM-ADMIN-ONLY — alta MANUAL de escuelas (Fase 5a).
 * Ruta: /platform/schools  (servida en el apex backpacksystems.com y en el
 * subdominio reservado platform.backpacksystems.com; el middleware deja pasar
 * ambos sin gating de tenant).
 *
 * SEGURIDAD: este componente es un shell de cliente; TODO dato y accion pasa por
 * /api/platform/schools, que exige requirePlatformAdmin() server-side (403 si no).
 * Un miembro normal de una org que abra esta URL recibe 403 de la API y ve la
 * pantalla de "Acceso restringido": no se filtra ningun dato ni puede crear nada.
 */

interface Organization {
  id: string;
  slug: string;
  name: string;
  plan?: string | null;
  active: boolean;
  created_at: string;
}

interface ProvisionResult {
  orgId: string | null;
  slug: string;
  ownerEmail: string;
  tempPassword: string | null;
  created: boolean;
  alreadyExisted: boolean;
  membership: boolean;
  subdomainRegistered: boolean;
  subdomainError?: string;
  subdomain: string;
  error?: string;
}

export default function PlatformSchoolsPage() {
  const [schools, setSchools] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/platform/schools");
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setSchools(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const columns: ColumnDef<Organization>[] = [
    {
      key: "name",
      header: "School",
      render: (o) => (
        <div>
          <p className="font-medium text-slate-900">{o.name}</p>
          <p className="text-xs text-slate-500">{o.slug}</p>
        </div>
      ),
    },
    {
      key: "subdomain",
      header: "Subdomain",
      render: (o) => (
        <span className="font-mono text-xs text-slate-600">{o.slug}.{ROOT_DOMAIN}</span>
      ),
    },
    { key: "plan", header: "Plan", render: (o) => o.plan ?? "—" },
    {
      key: "active",
      header: "Status",
      render: (o) =>
        o.active ? (
          <StatusBadge status="Active" tone="green" />
        ) : (
          <StatusBadge status="Inactive" tone="gray" />
        ),
    },
    {
      key: "created_at",
      header: "Created",
      render: (o) => (o.created_at ? new Date(o.created_at).toLocaleDateString() : "—"),
    },
  ];

  if (forbidden) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-card">
          <h1 className="text-lg font-bold text-slate-900">Acceso restringido</h1>
          <p className="mt-2 text-sm text-slate-600">
            Esta consola es solo para administradores de plataforma de Backpack.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <PageHeader
          title="Schools"
          description="Platform console — onboard and review every school on Backpack."
          actions={
            <button
              type="button"
              onClick={() => {
                setSubmitError(null);
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              <PlusIcon /> Create school
            </button>
          }
        />

        {submitError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <DataTable
            columns={columns}
            rows={schools}
            searchKeys={["name", "slug", "plan"]}
            searchPlaceholder="Search schools..."
            emptyTitle="No schools yet"
            emptyDescription="Create the first school to get started."
          />
        )}
      </div>

      {modalOpen && (
        <CreateModal
          title="Create school"
          submitLabel="Create"
          fields={[
            { name: "name", label: "School name", required: true },
            { name: "slug", label: "Slug (subdomain)", required: true },
            { name: "ownerEmail", label: "Owner email", type: "text", required: true },
            {
              name: "plan",
              label: "Plan",
              type: "select",
              options: ["Starter", "School", "Growth", "Enterprise"],
              required: true,
            },
          ]}
          onSubmit={async (data) => {
            setSubmitError(null);
            const res = await fetch("/api/platform/schools", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            const payload: ProvisionResult = await res.json();
            // El backend ya devuelve un status !2xx ante CUALQUIER error
            // (incl. fallo parcial con org creada); con esto evitamos mostrar el
            // modal de exito cuando el owner no quedo realmente con acceso.
            if (!res.ok || payload.error) {
              setSubmitError(payload.error ?? "No se pudo crear la escuela");
              return;
            }
            setResult(payload);
            // Refresca la lista con la nueva escuela.
            load();
          }}
          onClose={() => setModalOpen(false)}
        />
      )}

      {result && <SchoolCreatedModal result={result} onClose={() => setResult(null)} />}
    </div>
  );
}

// ── Panel de escuela creada (reusa el patron copyable de clients/page.tsx) ─────

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

function SchoolCreatedModal({
  result,
  onClose,
}: {
  result: ProvisionResult;
  onClose: () => void;
}) {
  const url = `https://${result.subdomain}`;
  const showPassword = result.created && result.tempPassword;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-600">
            ✓
          </span>
          <h3 className="text-lg font-bold text-slate-900">Escuela creada</h3>
        </div>

        {showPassword ? (
          <p className="mt-2 text-sm text-slate-600">
            Comparte estas credenciales con el owner. Deberá cambiar la contraseña al entrar a su
            portal.
          </p>
        ) : result.alreadyExisted ? (
          <p className="mt-2 text-sm text-slate-600">
            El email del owner ya tenía una cuenta; se vinculó como owner de esta escuela (no se
            generó una contraseña nueva).
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            La escuela quedó creada. Comparte el acceso del owner con su contraseña actual.
          </p>
        )}

        <div className="mt-4 space-y-3">
          <CredentialRow label="Portal" value={url} />
          <CredentialRow label="Owner email" value={result.ownerEmail} />
          {showPassword && (
            <CredentialRow label="Contraseña temporal" value={result.tempPassword!} mono />
          )}
        </div>

        {/* Estado del alta del subdominio en Vercel (best-effort). */}
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs">
          {result.subdomainRegistered ? (
            <p className="text-emerald-700">
              ✓ Subdominio <span className="font-mono">{result.subdomain}</span> registrado en Vercel.
            </p>
          ) : (
            <p className="text-amber-700">
              ⚠ Subdominio <span className="font-mono">{result.subdomain}</span> NO registrado
              automáticamente. {result.subdomainError ?? "Agrégalo manualmente en Vercel."}
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <CopyButton
            value={
              showPassword
                ? `Portal: ${url}\nOwner: ${result.ownerEmail}\nContraseña temporal: ${result.tempPassword}`
                : `Portal: ${url}\nOwner: ${result.ownerEmail}`
            }
            label="Copiar acceso"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
