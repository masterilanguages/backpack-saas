import type { ReactNode } from "react";

/**
 * Wrapper visual compartido por las pantallas de autenticación públicas
 * (login, reset de contraseña…). Muestra la FIRMA POR-ORGANIZACIÓN: el nombre
 * real de la escuela del subdominio (resuelto en el servidor vía
 * getBrandFromHost) + "Powered by Backpack" con el logito. En el apex/www (sin
 * tenant) el nombre cae a "Backpack".
 */
function BackpackLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="44" height="44" rx="10" fill="#1B2B4B" />
      <path d="M17 16.5C17 14.567 18.567 13 20.5 13h3C25.433 13 27 14.567 27 16.5V17h1.5A2.5 2.5 0 0 1 31 19.5v13A2.5 2.5 0 0 1 28.5 35h-13A2.5 2.5 0 0 1 13 32.5v-13A2.5 2.5 0 0 1 15.5 17H17v-.5Z" stroke="white" strokeWidth="1.8" fill="none" />
      <path d="M19 17h6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="18" y="23" width="8" height="1.8" rx="0.9" fill="white" />
    </svg>
  );
}

export default function AuthShell({
  brand,
  children,
}: {
  brand: { name: string };
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
      <div className="w-full max-w-md">
        {/* Firma de la escuela (por organización) */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-[#1B2B4B]">{brand.name}</h1>
          {/* Powered by Bayena */}
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <span className="text-sm text-slate-400">Powered by</span>
            <BackpackLogo />
            <span className="text-sm font-bold text-slate-500">Bayena</span>
          </div>
        </div>

        {children}

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-slate-400">
          &copy; {new Date().getFullYear()} Backpack. All rights reserved.
        </p>
      </div>
    </div>
  );
}
