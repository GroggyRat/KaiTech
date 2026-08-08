"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/hooks/useAuth";
import { TenantProvider, useTenant } from "@/lib/hooks/useTenant";
import { ThemeProvider } from "@/lib/hooks/useTheme";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { FeatureLocked } from "@/components/layout/FeatureLocked";
import { featureForRoute } from "@/lib/features";

// Single choke point for route-level feature gating: whatever page
// is about to render under (tenant), check whether its module is
// enabled for this tenant before showing it. This is what stops a
// typed-in URL from reaching a disabled module — the sidebar link
// being hidden isn't enough on its own. The actual data access is
// also blocked at the database layer regardless of this check
// (see sql/002_tenant_features.sql).
function FeatureGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isLoading, hasFeature } = useTenant();
  const feature = featureForRoute(pathname);

  if (feature && !isLoading && !hasFeature(feature.key)) {
    return <FeatureLocked label={feature.label} />;
  }
  return <>{children}</>;
}

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
                  <FeatureGate>{children}</FeatureGate>
                </div>
              </main>
            </div>
          </div>
        </TenantProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
