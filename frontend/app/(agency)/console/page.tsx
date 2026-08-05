"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { Building2, Users, CreditCard, TrendingUp, AlertCircle } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Tenant, TenantInvoice } from "@/types";

export default function ConsoleDashboardPage() {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [invoices, setInvoices] = useState<TenantInvoice[]>([]);
  const [stats, setStats] = useState({ totalTenants: 0, totalSeats: 0, totalRevenue: 0, overdueCount: 0 });
  const supabase = createClient();

  useEffect(() => {
    if (!user?.is_agency_superadmin) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    const { data: tenantData } = await supabase
      .from("tenants")
      .select("*")
      .eq("agency_id", user!.agency_id || "00000000-0000-0000-0000-000000000001")
      .order("created_at", { ascending: false });

    const { data: invoiceData } = await supabase
      .from("tenant_invoices")
      .select("*")
      .in("tenant_id", (tenantData || []).map((t) => t.id))
      .order("created_at", { ascending: false });

    setTenants(tenantData || []);
    setInvoices(invoiceData || []);

    const totalSeats = (tenantData || []).reduce((sum, t) => sum + (t.seat_limit || 0), 0);
    const totalRevenue = (invoiceData || [])
      .filter((i) => i.status === "paid")
      .reduce((sum, i) => sum + i.total_amount, 0);
    const overdueCount = (invoiceData || []).filter((i) => i.status === "overdue").length;

    setStats({
      totalTenants: tenantData?.length || 0,
      totalSeats,
      totalRevenue,
      overdueCount,
    });
  };

  if (!user?.is_agency_superadmin) {
    return (
      <div className="empty-state py-16">
        <AlertCircle className="h-8 w-8 text-[var(--danger)] mb-3" />
        <p className="text-[var(--foreground-muted)]">Access denied. Agency Console requires superadmin privileges.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-slide-up">
      <div>
        <h1 className="section-title">Agency Console</h1>
        <p className="text-[var(--foreground-muted)] mt-1">Overview of all tenant accounts</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-[#FF6B35]/10">
              <Building2 className="h-5 w-5 text-[#FF6B35]" />
            </div>
          </div>
          <p className="text-2xl font-semibold">{stats.totalTenants}</p>
          <p className="text-sm text-[var(--foreground-muted)] mt-0.5">Active Tenants</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-[var(--accent)]/10">
              <Users className="h-5 w-5 text-[var(--accent)]" />
            </div>
          </div>
          <p className="text-2xl font-semibold">{stats.totalSeats}</p>
          <p className="text-sm text-[var(--foreground-muted)] mt-0.5">Total Seat Capacity</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-[var(--success)]/10">
              <CreditCard className="h-5 w-5 text-[var(--success)]" />
            </div>
          </div>
          <p className="text-2xl font-semibold">{formatCurrency(stats.totalRevenue)}</p>
          <p className="text-sm text-[var(--foreground-muted)] mt-0.5">Revenue Collected</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-[var(--danger)]/10">
              <TrendingUp className="h-5 w-5 text-[var(--danger)]" />
            </div>
          </div>
          <p className="text-2xl font-semibold">{stats.overdueCount}</p>
          <p className="text-sm text-[var(--foreground-muted)] mt-0.5">Overdue Invoices</p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Tenants</h2>
          <Link href="/console/tenants/" className="text-sm text-[var(--accent)] hover:underline">
            View All
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-2 font-medium text-[var(--foreground-muted)]">Tenant</th>
                <th className="text-left py-2 font-medium text-[var(--foreground-muted)]">Plan</th>
                <th className="text-right py-2 font-medium text-[var(--foreground-muted)]">Seats</th>
                <th className="text-right py-2 font-medium text-[var(--foreground-muted)]">Rate</th>
                <th className="text-center py-2 font-medium text-[var(--foreground-muted)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {tenants.slice(0, 10).map((tenant) => {
                const latestInvoice = invoices
                  .filter((i) => i.tenant_id === tenant.id)
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
                return (
                  <tr key={tenant.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        {tenant.logo_url ? (
                          <img src={tenant.logo_url} alt="" className="h-6 w-6 rounded object-contain" />
                        ) : (
                          <div className="h-6 w-6 rounded bg-[var(--accent)]/10 flex items-center justify-center text-xs font-medium text-[var(--accent)]">
                            {tenant.name[0]}
                          </div>
                        )}
                        <span className="font-medium">{tenant.name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-[var(--foreground-muted)]">{tenant.plan_tier_id ? "Plan" : "Custom"}</td>
                    <td className="py-3 text-right">{tenant.seat_limit}</td>
                    <td className="py-3 text-right">{formatCurrency(tenant.seat_override || 15)}/seat</td>
                    <td className="py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        tenant.is_suspended
                          ? "bg-[var(--danger)]/10 text-[var(--danger)]"
                          : latestInvoice?.status === "overdue"
                          ? "bg-[var(--warning)]/10 text-[var(--warning)]"
                          : "bg-[var(--success)]/10 text-[var(--success)]"
                      }`}>
                        {tenant.is_suspended ? "Suspended" : latestInvoice?.status === "overdue" ? "Overdue" : "Active"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
