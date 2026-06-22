import Link from "next/link";
import { COMPANY_LIST } from "@/lib/companies";
import PageHeader from "@/components/PageHeader";

export default function CompaniesPage() {
  return (
    <div>
      <PageHeader
        title="Companies"
        description="The three businesses managed from this panel."
      />

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {COMPANY_LIST.map((company) => (
          <div
            key={company.id}
            className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card"
          >
            <div className="h-2" style={{ backgroundColor: company.color }} />
            <div className="p-5">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-sm font-bold text-white"
                  style={{ backgroundColor: company.color }}
                >
                  {company.initials}
                </span>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{company.name}</h2>
                  <p className="text-xs text-slate-500">
                    {company.industry} · {company.currency}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-600">{company.tagline}</p>

              <dl className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-slate-50 p-3 text-center">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                    {company.labels.clients}
                  </dt>
                  <dd className="text-sm font-semibold text-slate-900">
                    {company.data.clients.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">Leads</dt>
                  <dd className="text-sm font-semibold text-slate-900">
                    {company.data.leads.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                    {company.labels.team}
                  </dt>
                  <dd className="text-sm font-semibold text-slate-900">
                    {company.data.team.length}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex gap-2">
                <Link
                  href={`/companies/${company.id}/dashboard`}
                  className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  Dashboard
                </Link>
                <Link
                  href={`/companies/${company.id}/settings`}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Settings
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
