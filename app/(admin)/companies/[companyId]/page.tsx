import { redirect } from "next/navigation";

export default function CompanyIndexPage({
  params,
}: {
  params: { companyId: string };
}) {
  redirect(`/companies/${params.companyId}/dashboard`);
}
