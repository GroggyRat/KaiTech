"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tenant, UserTenantRole, AppRole } from "@/types";

interface TenantContextType {
  tenant: Tenant | null;
  role: AppRole | null;
  isLoading: boolean;
  setTenant: (tenantId: string) => void;
  switchTenant: (tenantId: string) => void;
}

const TenantContext = createContext<TenantContextType>({
  tenant: null,
  role: null,
  isLoading: true,
  setTenant: () => {},
  switchTenant: () => {},
});

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenantState] = useState<Tenant | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  const loadTenant = async () => {
    const stored = localStorage.getItem("kaiworkforce_tenant_id");
    if (!stored) {
      setIsLoading(false);
      return;
    }

    const { data: tenantData } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", stored)
      .single();

    if (tenantData) {
      setTenantState(tenantData);
      document.documentElement.style.setProperty("--accent", tenantData.accent_color);

      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: roleData } = await supabase
          .from("user_tenant_roles")
          .select("role")
          .eq("user_id", userData.user.id)
          .eq("tenant_id", stored)
          .single();
        setRole(roleData?.role || null);
      }
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadTenant();
  }, []);

  const setTenant = (tenantId: string) => {
    localStorage.setItem("kaiworkforce_tenant_id", tenantId);
    loadTenant();
  };

  const switchTenant = (tenantId: string) => {
    localStorage.setItem("kaiworkforce_tenant_id", tenantId);
    window.location.reload();
  };

  return (
    <TenantContext.Provider value={{ tenant, role, isLoading, setTenant, switchTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
