"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { Plus, Pencil, Ban, RotateCcw, Eye } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Tenant, PlanTier } from "@/types";

export default function ConsoleTenantsPage() {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [plans, setPlans] = useState<PlanTier[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => { if (user?.is_agency_superadmin) loadData(); }, [user]);

  const loadData = async () => {
    const { data: tData } = await supabase.from("tenants").select("*").eq("agency_id", user!.agency_id || "00000000-0000-0000-0000-000000000001").order("created_at", { ascending: false });
    const { data: pData } = await supabase.from("plan_tiers").select("*").eq("agency_id", user!.agency_id || "00000000-0000-0000-0000-000000000001");
    setTenants(tData || []);
    setPlans(pData || []);
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);

    if (!["image/png", "image/jpeg", "image/svg+xml", "image/webp"].includes(file.type)) {
      setLogoError("Please choose a PNG, JPG, WebP, or SVG image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Image must be under 2MB.");
      return;
    }

    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setLogoError(null);

    const form = new FormData(e.currentTarget);
    const payload: Record<string, any> = {
      agency_id: user!.agency_id || "00000000-0000-0000-0000-000000000001",
      name: form.get("name") as string,
      contact_email: form.get("contact_email") as string,
      plan_tier_id: (form.get("plan_tier_id") as string) || null,
      seat_limit: parseInt(form.get("seat_limit") as string),
      seat_override: form.get("seat_override") ? parseFloat(form.get("seat_override") as string) : null,
      timezone: form.get("timezone") as string,
      currency: form.get("currency") as string,
      pay_period_frequency: form.get("pay_period_frequency") as string,
      accent_color: form.get("accent_color") as string,
    };

    if (logoFile) {
      const ext = logoFile.name.split(".").pop();
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("tenant-logos")
        .upload(path, logoFile, { upsert: true });

      if (uploadError) {
        setLogoError(`Logo upload failed: ${uploadError.message}`);
        setIsSaving(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from("tenant-logos").getPublicUrl(path);
      payload.logo_url = publicUrlData.publicUrl;
    }

    if (editingTenant) {
      await supabase.from("tenants").update(payload).eq("id", editingTenant.id);
    } else {
      await supabase.from("tenants").insert(payload);
    }
    setShowModal(false);
    setEditingTenant(null);
    setLogoFile(null);
    setLogoPreview(null);
    setIsSaving(false);
    loadData();
  };

  const handleSuspend = async (id: string, suspend: boolean) => {
    await supabase.from("tenants").update({ is_suspended: suspend }).eq("id", id);
    loadData();
  };

  const handleImpersonate = (tenantId: string) => {
    localStorage.setItem("kaiworkforce_tenant_id", tenantId);
    localStorage.setItem("kaiworkforce_impersonating", "true");
    window.location.href = "/";
  };

  if (!user?.is_agency_superadmin) {
    return <div className="empty-state py-16"><p className="text-[var(--foreground-muted)]">Access denied</p></div>;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <h1 className="section-title">Tenants</h1>
        <button onClick={() => { setEditingTenant(null); setLogoFile(null); setLogoPreview(null); setLogoError(null); setShowModal(true); }} className="btn-primary" style={{ backgroundColor: "#FF6B35" }}>
          <Plus className="h-4 w-4 mr-2" />Add Tenant
        </button>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-3 px-4 font-medium text-[var(--foreground-muted)]">Tenant</th>
                <th className="text-left py-3 px-4 font-medium text-[var(--foreground-muted)]">Contact</th>
                <th className="text-right py-3 px-4 font-medium text-[var(--foreground-muted)]">Seats</th>
                <th className="text-center py-3 px-4 font-medium text-[var(--foreground-muted)]">Status</th>
                <th className="text-right py-3 px-4 font-medium text-[var(--foreground-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-elevated)]/50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {tenant.logo_url ? (
                        <img src={tenant.logo_url} alt="" className="h-8 w-8 rounded-lg object-contain bg-white" />
                      ) : (
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center text-sm font-medium text-white" style={{ backgroundColor: tenant.accent_color }}>
                          {tenant.name[0]}
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{tenant.name}</p>
                        <p className="text-xs text-[var(--foreground-muted)]">{tenant.currency} · {tenant.pay_period_frequency}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-[var(--foreground-muted)]">{tenant.contact_email || "—"}</td>
                  <td className="py-3 px-4 text-right">{tenant.seat_limit}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${tenant.is_suspended ? "bg-[var(--danger)]/10 text-[var(--danger)]" : "bg-[var(--success)]/10 text-[var(--success)]"}`}>
                      {tenant.is_suspended ? "Suspended" : "Active"}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => handleImpersonate(tenant.id)} className="p-1.5 rounded-lg hover:bg-[var(--surface-elevated)] text-[var(--accent)]" title="Impersonate"><Eye className="h-4 w-4" /></button>
                      <button onClick={() => { setEditingTenant(tenant); setLogoFile(null); setLogoPreview(tenant.logo_url); setLogoError(null); setShowModal(true); }} className="p-1.5 rounded-lg hover:bg-[var(--surface-elevated)]"><Pencil className="h-4 w-4 text-[var(--foreground-muted)]" /></button>
                      {tenant.is_suspended ? (
                        <button onClick={() => handleSuspend(tenant.id, false)} className="p-1.5 rounded-lg hover:bg-[var(--surface-elevated)] text-[var(--success)]"><RotateCcw className="h-4 w-4" /></button>
                      ) : (
                        <button onClick={() => handleSuspend(tenant.id, true)} className="p-1.5 rounded-lg hover:bg-[var(--surface-elevated)] text-[var(--danger)]"><Ban className="h-4 w-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--surface-overlay)]">
          <div className="w-full max-w-lg rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">{editingTenant ? "Edit Tenant" : "Create Tenant"}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="label">Logo</label>
                <div className="flex items-center gap-3">
                  {logoPreview ? (
                    <img src={logoPreview} alt="" className="h-14 w-14 rounded-xl object-contain bg-white border border-[var(--border)]" />
                  ) : (
                    <div className="h-14 w-14 rounded-xl flex items-center justify-center text-lg font-medium text-white shrink-0" style={{ backgroundColor: editingTenant?.accent_color || "#007AFF" }}>
                      {editingTenant?.name ? editingTenant.name[0].toUpperCase() : "?"}
                    </div>
                  )}
                  <label className="btn-secondary cursor-pointer">
                    Choose Image
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoSelect} className="hidden" />
                  </label>
                </div>
                {logoError && <p className="text-xs text-[var(--danger)] mt-2">{logoError}</p>}
                <p className="text-xs text-[var(--foreground-muted)] mt-1">PNG, JPG, WebP, or SVG. Under 2MB.</p>
              </div>
              <div><label className="label">Tenant Name</label><input name="name" defaultValue={editingTenant?.name} className="input" required /></div>
              <div><label className="label">Contact Email</label><input name="contact_email" type="email" defaultValue={editingTenant?.contact_email || ""} className="input" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Plan Tier</label><select name="plan_tier_id" defaultValue={editingTenant?.plan_tier_id || ""} className="input"><option value="">Custom</option>{plans.map((p) => (<option key={p.id} value={p.id}>{p.name} ({p.seat_limit} seats)</option>))}</select></div>
                <div><label className="label">Seat Limit</label><input name="seat_limit" type="number" defaultValue={editingTenant?.seat_limit || 20} className="input" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Custom Rate</label><input name="seat_override" type="number" step="0.01" defaultValue={editingTenant?.seat_override || ""} className="input" /></div>
                <div><label className="label">Accent Color</label><input name="accent_color" type="color" defaultValue={editingTenant?.accent_color || "#007AFF"} className="input h-10 p-1" /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><label className="label">Timezone</label><select name="timezone" defaultValue={editingTenant?.timezone || "Pacific/Fiji"} className="input"><option value="Pacific/Fiji">Pacific/Fiji</option><option value="Pacific/Auckland">Pacific/Auckland</option><option value="UTC">UTC</option></select></div>
                <div><label className="label">Currency</label><select name="currency" defaultValue={editingTenant?.currency || "FJD"} className="input"><option value="FJD">FJD</option><option value="USD">USD</option><option value="AUD">AUD</option><option value="NZD">NZD</option></select></div>
                <div><label className="label">Pay Frequency</label><select name="pay_period_frequency" defaultValue={editingTenant?.pay_period_frequency || "fortnightly"} className="input"><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option></select></div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setEditingTenant(null); setLogoFile(null); setLogoPreview(null); setLogoError(null); }} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={isSaving} className="btn-primary flex-1" style={{ backgroundColor: "#FF6B35" }}>{isSaving ? "Saving..." : editingTenant ? "Save Changes" : "Create Tenant"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
