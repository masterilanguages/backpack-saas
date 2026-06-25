import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default function GlobalDashboardPage() {
  // Resolve the active tenant from the trusted, middleware-set header instead of
  // hardcoding a slug. Fallback to "masteri" if the header is absent.
  const slug = headers().get("x-org-slug") ?? "masteri";
  redirect(`/companies/${slug}/dashboard`);
}
