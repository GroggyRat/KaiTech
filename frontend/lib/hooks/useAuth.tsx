"use client";

import { useEffect, useState, createContext, useContext } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, UserTenantRole, AppRole } from "@/types";

interface AuthContextType {
  user: Profile | null;
  roles: UserTenantRole[];
  isLoading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  roles: [],
  isLoading: true,
  signOut: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [user, setUser] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserTenantRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  const loadUser = async () => {
  const { data: { session } } = await supabase.auth.getSession();
    const authUser = session?.user;
    if (!authUser) {
      setUser(null);
      setRoles([]);
      setIsLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", authUser.id)
      .single();

    const { data: userRoles } = await supabase
      .from("user_tenant_roles")
      .select("*")
      .eq("user_id", authUser.id);

    setUser(profile);
    setRoles(userRoles || []);
    setIsLoading(false);
  };

  useEffect(() => {
    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadUser();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRoles([]);
    window.location.href = "/auth/login/";
  };

  return (
    <AuthContext.Provider value={{ user, roles, isLoading, signOut, refresh: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
