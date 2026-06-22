import { notFound } from "next/navigation";
import { isCompanyId } from "@/lib/companies";

export default function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { companyId: string };
}) {
  if (!isCompanyId(params.companyId)) {
    notFound();
  }
  return <>{children}</>;
}

export function generateStaticParams() {
  return [{ companyId: "avinu" }, { companyId: "masteri" }, { companyId: "bayena" }];
}
