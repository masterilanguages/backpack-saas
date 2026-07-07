"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/AuthContext";
import { UILanguageProvider } from "@/lib/i18n/UILanguage";

export default function Providers({ children }: { children: React.ReactNode }) {
  // Create the QueryClient once per app instance (kept in state so it is stable
  // across re-renders and never recreated on the client).
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UILanguageProvider>
          {children}
          <Toaster />
        </UILanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
