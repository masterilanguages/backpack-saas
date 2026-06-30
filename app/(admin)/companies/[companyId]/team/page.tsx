"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import CreateModal from "@/components/CreateModal";
import ActionMenu from "@/components/ActionMenu";
import AccountCreatedModal, { type AccountInfo } from "@/components/AccountCreatedModal";
import { PlusIcon, SearchIcon } from "@/components/Icons";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  speciality: string;
  status: string;
}

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export default function TeamPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);

  useEffect(() => {
    fetch(`/api/school/${companyId}/team`).then((r) => r.json()).then((d) => setTeam(Array.isArray(d) ? d : []));
  }, [companyId]);

  const onDelete = async (id: string) => {
    await fetch(`/api/school/${companyId}/team`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setTeam((prev) => prev.filter((m) => m.id !== id));
  };

  const filtered = useMemo(() =>
    team.filter((m) =>
      [m.name, m.role, m.email, m.speciality].some((v) => v?.toLowerCase().includes(query.toLowerCase()))
    ), [team, query]);

  return (
    <div>
      <PageHeader
        title="Team"
        description="Coaches and staff."
        actions={
          <button type="button" onClick={() => setModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700">
            <PlusIcon /> Add member
          </button>
        }
      />
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <SearchIcon className="h-4 w-4 text-slate-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search team..." className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No team members yet" description="Add your first coach or staff member." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((m) => (
            <div key={m.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
                  {initials(m.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{m.name}</p>
                  <p className="truncate text-sm text-slate-500">{m.role ?? "—"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <StatusBadge status={m.status} />
                  <ActionMenu
                    items={[
                      { label: "Edit", onClick: () => setEditing(m) },
                      { label: "Delete", destructive: true, onClick: () => onDelete(m.id) },
                    ]}
                  />
                </div>
              </div>
              {m.speciality && <p className="mt-3 text-xs text-slate-500">{m.speciality}</p>}
              <div className="mt-3 space-y-1 text-xs text-slate-500">
                {m.email && <p>{m.email}</p>}
                {m.phone && <p>{m.phone}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {modalOpen && (
        <CreateModal
          title="Add team member"
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "role", label: "Role" },
            { name: "email", label: "Email" },
            { name: "phone", label: "Phone" },
            { name: "speciality", label: "Speciality" },
            { name: "status", label: "Status", type: "select", options: ["Active", "Freelance", "Inactive"] },
          ]}
          onSubmit={async (data) => {
            const res = await fetch(`/api/school/${companyId}/team`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            const member = await res.json();
            setTeam((prev) => [member, ...prev]);
            setModalOpen(false);
            if (member._account) setAccountInfo(member._account);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
      {editing && (
        <CreateModal
          title="Edit team member"
          submitLabel="Update"
          initialValues={{
            name: editing.name ?? "",
            role: editing.role ?? "",
            email: editing.email ?? "",
            phone: editing.phone ?? "",
            speciality: editing.speciality ?? "",
            status: editing.status ?? "",
          }}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "role", label: "Role" },
            { name: "email", label: "Email" },
            { name: "phone", label: "Phone" },
            { name: "speciality", label: "Speciality" },
            { name: "status", label: "Status", type: "select", options: ["Active", "Freelance", "Inactive"] },
          ]}
          onSubmit={async (data) => {
            await fetch(`/api/school/${companyId}/team`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: editing.id, ...data }),
            });
            setTeam((prev) => prev.map((x) => (x.id === editing.id ? { ...x, ...data } : x)));
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {accountInfo && (
        <AccountCreatedModal account={accountInfo} kind="coach" onClose={() => setAccountInfo(null)} />
      )}
    </div>
  );
}
