import StudentLayout from "@/components/student/StudentLayout";
import Providers from "@/components/providers/Providers";

// El portal de estudiante es dinamico (auth + datos Supabase en vivo, paginas
// 'use client' que leen useSearchParams). Esto opta a todo el grupo (student) a
// render dinamico y evita el bailout de "useSearchParams sin Suspense" en build.
// El middleware multi-tenant ya hace el gate de servidor (subdominio + membership
// + x-org-id/x-user-role); Providers monta AuthProvider (sesion cliente) +
// QueryClientProvider + Toaster, y StudentLayout pinta el shell (sidebar/topbar)
// con su gate de cliente.
export const dynamic = "force-dynamic";

export default function StudentGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Providers>
      <StudentLayout>{children}</StudentLayout>
    </Providers>
  );
}
