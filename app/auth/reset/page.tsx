import AuthShell from "@/components/AuthShell";
import ResetForm from "./reset-form";
import { getBrandFromHost } from "@/lib/tenant-host";

// Necesita el Host de la petición (firma por-organización) -> render dinámico.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const brand = await getBrandFromHost();
  return (
    <AuthShell brand={brand}>
      <ResetForm />
    </AuthShell>
  );
}
