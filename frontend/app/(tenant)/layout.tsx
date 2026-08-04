"use client";

import { AuthProvider } from "@/lib/hooks/useAuth";
import { TenantProvider } from "@/lib/hooks/useTenant";
import { ThemeProvider } from "@/lib/hooks/useTheme";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TenantProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <Header />
              <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
                <div className="max-w-6xl mx-auto">
                  {children}
                </div>
              </main>
            </div>
          </div>
        </TenantProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
