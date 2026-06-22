"use client";

import { useMemo, useState } from "react";
import { useCompany } from "@/lib/useCompany";
import { useLocalStorage } from "@/lib/useLocalStorage";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import ActionMenu from "@/components/ActionMenu";
import CreateModal from "@/components/CreateModal";
import { PlusIcon, SearchIcon } from "@/components/Icons";
import type { TeamMember } from "@/lib/types";

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function TeamPage() {
  const company = useCompany();
  const [team, setTeam] = useLocalStorage<TeamMember[]>("masteri-team", company.data.team);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return team;
    return team.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q) ||
        (m.speciality ?? "").toLowerCase().includes(q)
    );
  }, [team, search]);

  return (
    <div>
      <PageHeader
        title={company.labels.team}
        description={`The people behind ${company.name}.`}
        actions={
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <PlusIcon /> Add member
          </button>
        }
      />

      <div className="relative mb-5 max-w-xs">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${company.labels.team.toLowerCase()}...`}
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No members found" description="Try a different search term." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((member) => (
            <div
              key={member.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-card"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: company.color }}
                  >
                    {initials(member.name)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{member.name}</p>
                    <p className="text-xs text-slate-500">{member.role}</p>
                  </div>
                </div>
                <ActionMenu
                  items={[
                    {
                      label: "Delete",
                      destructive: true,
                      onClick: () => setTeam((prev) => prev.filter((m) => m.id !== member.id)),
                    },
                  ]}
                />
              </div>
              {member.speciality && (
                <p className="mt-3 text-sm text-slate-600">{member.speciality}</p>
              )}
              <div className="mt-3 space-y-1 text-xs text-slate-500">
                <p>{member.email}</p>
                <p>{member.phone}</p>
              </div>
              <div className="mt-3">
                <StatusBadge status={member.status} />
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <CreateModal
          title="Add Team Member"
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "role", label: "Role" },
            { name: "email", label: "Email" },
            { name: "phone", label: "Phone" },
            { name: "status", label: "Status", type: "select", options: ["Active", "Away"] },
          ]}
          onSubmit={(data) => {
            const newMember: TeamMember = {
              id: Date.now().toString(),
              name: data.name,
              role: data.role ?? "",
              email: data.email ?? "",
              phone: data.phone ?? "",
              status: (data.status as TeamMember["status"]) ?? "Active",
            };
            setTeam((prev) => [newMember, ...prev]);
          }}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
