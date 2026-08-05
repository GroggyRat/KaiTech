"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { Plus, CreditCard } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { TenantInvoice, Tenant } from "@/types";

export default function ConsoleBillingPage() {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<TenantInvoice[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [showModal, setShowModal] = useState(false);
  const supabase = createClient();

  useEffect(() => { if (user?.is_agency_superadmin) loadData(); }, [user]);

  const loadData = async () => {
    const { data: tData } = await supabase.from("tenants").select("*").eq("agency_id", user!.agency_id || "00000000-0000-0000-0000-000000000001");
    const { data: iData } = await supabase.from("tenant_invoices").select("*").in("tenant_id", (tData || []).map((t: Tenant) => t.id)).order("created_at", { ascending: false });
    setTenants(tData || []);
    setInvoices(iData || []);
  };

  const handleCreateInvoice = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const tenantId = form.get("tenant_id") as string;
    const tenant = tenants.find((t) => t.id === tenantId);
    if (!tenant) return;

    const periodStart = form.get("period_start") as string;
    const periodEnd = form.get("period_end") as string;
    const rate = tenant.seat_override || 15;

    const { count } = await supabase.from("employees").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true);

    await supabase.from("tenant_invoices").insert({
      tenant_id: tenantId,
      period_start: periodStart,
      period_end: periodEnd,
      seat_count: count || 0,
      rate_per_seat: rate,
      total_amount: (count || 0) * rate,
      status: "pending",
    });

    setShowModal(false);
    loadData();
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("tenant_invoices").update({ status, paid_at: status === "paid" ? new Date().toISOString() : null }).eq("id", id);
    loadData();
  };

  if (!user?.is_agency_superadmin) return <div className="empty-state py-16"><p className="text-[var(--foreground-muted)]">Access denied</p></div>;

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <h1 className="section-title">Billing</h1>
        <button onClick={() => setShowModal(true)} className="btn-primary" style={{ backgroundColor: "#FF6B35" }}>
          <Plus className="h-4 w-4 mr-2" />Create Invoice
        </button>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-3 px-4 font-medium text-[var(--foreground-muted)]">Tenant</th>
                <th className="text-left py-3 px-4 font-medium text-[var(--foreground-muted)]">Period</th>
                <th className="text-right py-3 px-4 font-medium text-[var(--foreground-muted)]">Seats</th>
                <th className="text-right py-3 px-4 font-medium text-[var(--foreground-muted)]">Amount</th>
                <th className="text-center py-3 px-4 font-medium text-[var(--foreground-muted)]">Status</th>
                <th className="text-right py-3 px-4 font-medium text-[var(--foreground-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-3 px-4 font-medium">{tenants.find((t) => t.id === inv.tenant_id)?.name || inv.tenant_id.slice(0, 8)}</td>
                  <td className="py-3 px-4 text-[var(--foreground-muted)]">{formatDate(inv.period_start)} – {formatDate(inv.period_end)}</td>
                  <td className="py-3 px-4 text-right">{inv.seat_count}</td>
                  <td className="py-3 px-4 text-right font-medium">{formatCurrency(inv.total_amount)}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      inv.status === "paid" ? "bg-[var(--success)]/10 text-[var(--success)]" :
                      inv.status === "overdue" ? "bg-[var(--danger)]/10 text-[var(--danger)]" :
                      "bg-[var(--warning)]/10 text-[var(--warning)]"
                    }`}>{inv.status}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <select value={inv.status} onChange={(e) => updateStatus(inv.id, e.target.value)} className="text-xs bg-transparent border border-[var(--border)] rounded-lg px-2 py-1">
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                      <option value="overdue">Overdue</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--surface-overlay)]">
          <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 animate-slide-up">
            <h2 className="text-lg font-semibold mb-4">Create Invoice</h2>
            <form onSubmit={handleCreateInvoice} className="space-y-4">
              <div><label className="label">Tenant</label><select name="tenant_id" className="input" required>{tenants.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}</select></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Period Start</label><input name="period_start" type="date" className="input" required /></div>
                <div><label className="label">Period End</label><input name="period_end" type="date" className="input" required /></div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1" style={{ backgroundColor: "#FF6B35" }}>Create</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
