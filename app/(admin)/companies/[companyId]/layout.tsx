import { notFound } from "next/navigation";
import { schoolExistsBySlug } from "@/lib/queries";

// The tenant set is dynamic (real orgs in the DB), so do not pre-render a
// hardcoded list of slugs.
export const dynamic = "force-dynamic";

export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { companyId: string };
}) {
  // Real validation against the organizations table (replaces the old mock
  // isCompanyId check). Unknown slug -> 404.
  const exists = await schoolExistsBySlug(params.companyId);
  if (!exists) {
    notFound();
  }
  return <>{children}</>;
}
