"use client";

import { useState } from "react";

/**
 * Panel de "cuenta creada" reutilizable (alumno o coach): muestra las
 * credenciales DENTRO de la interfaz, con botones para copiar el email y la
 * contraseña temporal. Reemplaza a cualquier window.alert.
 */
export interface AccountInfo {
  email: string;
  tempPassword: string | null;
  created: boolean;
  alreadyExisted: boolean;
  error?: string;
}

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

export default function AccountCreatedModal({
  account,
  kind = "alumno",
  onClose,
}: {
  account: AccountInfo;
  kind?: string;
  onClose: () => void;
}) {
  const ok = account.created && account.tempPassword;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {ok ? (
          <>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-600">
                ✓
              </span>
              <h3 className="text-lg font-bold text-slate-900">Cuenta creada</h3>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Comparte estas credenciales con el {kind}. Deberá cambiar la contraseña al entrar.
            </p>
            <div className="mt-4 space-y-3">
              <CredentialRow label="Email" value={account.email} />
              <CredentialRow label="Contraseña temporal" value={account.tempPassword!} mono />
            </div>
            <div className="mt-5 flex items-center justify-between">
              <CopyButton value={`Email: ${account.email}\nContraseña temporal: ${account.tempPassword}`} label="Copiar ambas" />
              <button type="button" onClick={onClose} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700">
                Listo
              </button>
            </div>
          </>
        ) : account.alreadyExisted ? (
          <>
            <h3 className="text-lg font-bold text-slate-900">{kind === "coach" ? "Coach vinculado" : "Alumno vinculado"}</h3>
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium">{account.email}</span> ya tenía una cuenta; se vinculó a esta escuela. Entra con su contraseña actual (no se generó una nueva).
            </p>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={onClose} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700">
                Entendido
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-lg font-bold text-slate-900">Se agregó al roster</h3>
            <p className="mt-2 text-sm text-slate-600">
              Quedó en la lista, pero la cuenta de acceso no se pudo crear
              {account.error ? `: ${account.error}` : "."}
            </p>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={onClose} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700">
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
