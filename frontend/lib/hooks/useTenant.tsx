"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tenant, UserTenantRole, AppRole } from "@/types";

interface TenantContextType {
  tenant: Tenant | null;
  role: AppRole | null;
  roles: UserTenantRole[];
  isLoading: boolean;
  setTenant: (tenantId: string) => void;
  switchTenant: (tenantId: string) => void;
}

const TenantContext = createContext<TenantContextType>({
  tenant: null,
  role: null,
  roles: [],
  isLoading: true,
  setTenant: () => {},
  switchTenant: () => {},
});

export function TenantProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [tenant, setTenantState] = useState<Tenant | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<UserTenantRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  const loadTenant = async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setIsLoading(false);
      return;
    }

    // All tenants this user has a role in (for the tenant switcher).
    const { data: allRoles } = await supabase
      .from("user_tenant_roles")
      .select("*")
      .eq("user_id", userData.user.id);
    setRoles(allRoles || []);

    let tenantId = localStorage.getItem("kaiworkforce_tenant_id");

    // No tenant remembered on this device/browser (new device, new browser,
    // incognito, cleared storage, etc.) — look up the user's actual tenant
    // from the database instead of just giving up with no data.
    if (!tenantId) {
      const { data: roleRows } = await supabase
        .from("user_tenant_roles")
        .select("tenant_id, is_primary")
        .eq("user_id", userData.user.id)
        .order("is_primary", { ascending: false });

      if (roleRows && roleRows.length > 0) {
        tenantId = roleRows[0].tenant_id as string;
        localStorage.setItem("kaiworkforce_tenant_id", tenantId as string);
      } else {
        setIsLoading(false);
        return;
      }
    }

    const { data: tenantData } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", tenantId)
      .single();

    if (tenantData) {
      setTenantState(tenantData);
      document.documentElement.style.setProperty("--accent", tenantData.accent_color);

      const { data: roleData } = await supabase
        .from("user_tenant_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("tenant_id", tenantId)
        .single();
      setRole(roleData?.role || null);
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
    <TenantContext.Provider value={{ tenant, role, roles, isLoading, setTenant, switchTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
