"use client";

import { useParams } from "next/navigation";
import { COMPANIES } from "./companies";
import type { Company, CompanyId } from "./types";

/**
 * Returns the active company based on the URL.
 * Safe to assume validity: the [companyId] layout 404s on unknown ids.
 */
export function useCompany(): Company {
  const params = useParams<{ companyId: string }>();
  return COMPANIES[params.companyId as CompanyId];
}
