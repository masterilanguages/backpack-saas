import AuthShell from "@/components/AuthShell";
import LoginForm from "./login-form";
import { getBrandFromHost } from "@/lib/tenant-host";

// Necesita el Host de la petición (firma por-organización) -> render dinámico.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const brand = await getBrandFromHost();
  // El auto-registro de alumno solo aplica en un subdominio de escuela (hay
  // tenant); en apex/www (platform-admin) no se ofrece "Create account".
  const canSignup = Boolean(brand.slug);

  return (
    <AuthShell brand={brand}>
      <div className="rounded-2xl bg-white p-8 shadow-xl">
        <LoginForm canSignup={canSignup} />
      </div>
    </AuthShell>
  );
}
