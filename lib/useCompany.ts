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
  const id = params.companyId;
  const configured = COMPANIES[id as CompanyId];
  if (configured) return configured;
  // Escuela sin config propia (Stan y futuras): plantilla de escuela de idiomas
  // (labels + módulos estándar) con el id correcto. El nombre/branding reales
  // vienen de la BD vía useSchool(); aquí solo importan labels/modules/id, que
  // son iguales para toda escuela de idiomas en Backpack. Sin esto, useCompany
  // devolvía undefined y las páginas que lo usan (Lessons, Modules) crasheaban.
  return {
    ...COMPANIES.masteri,
    id,
    name: id,
    initials: (id.slice(0, 2) || "S").toUpperCase(),
  };
}
