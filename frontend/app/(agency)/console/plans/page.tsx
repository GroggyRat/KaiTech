"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { PlanTier } from "@/types";

export default function ConsolePlansPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanTier[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanTier | null>(null);
  const supabase = createClient();

  useEffect(() => { if (user?.is_agency_superadmin) loadData(); }, [user]);

  const loadData = async () => {
    const { data } = await supabase.from("plan_tiers").select("*").eq("agency_id", user!.agency_id || "00000000-0000-0000-0000-000000000001").order("seat_limit", { ascending: true });
    setPlans(data || []);
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      agency_id: user!.agency_id || "00000000-0000-0000-0000-000000000001",
      name: form.get("name") as string,
      seat_limit: parseInt(form.get("seat_limit") as string),
      per_seat_rate: parseFloat(form.get("per_seat_rate") as string),
      description: form.get("description") as string,
    };
    if (editingPlan) {
      await supabase.from("plan_tiers").update(payload).eq("id", editingPlan.id);
    } else {
      await supabase.from("plan_tiers").insert(payload);
    }
    setShowModal(false);
    setEditingPlan(null);
    loadData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("plan_tiers").delete().eq("id", id);
    loadData();
  };

  if (!user?.is_agency_superadmin) return <div className="empty-state py-16"><p className="text-[var(--foreground-muted)]">Access denied</p></div>;

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <h1 className="section-title">Plan Tiers</h1>
        <button onClick={() => { setEditingPlan(null); setShowModal(true); }} className="btn-primary" style={{ backgroundColor: "#FF6B35" }}>
          <Plus className="h-4 w-4 mr-2" />Add Plan
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <div key={plan.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="text-sm text-[var(--foreground-muted)] mt-0.5">{plan.description}</p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditingPlan(plan); setShowModal(true); }} className="p-1.5 rounded-lg hover:bg-[var(--surface-elevated)]"><Pencil className="h-4 w-4 text-[var(--foreground-muted)]" /></button>
                <button onClick={() => handleDelete(plan.id)} className="p-1.5 rounded-lg hover:bg-[var(--surface-elevated)]"><Trash2 className="h-4 w-4 text-[var(--danger)]" /></button>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-semibold">{formatCurrency(plan.per_seat_rate)}</span>
                <span className="text-sm text-[var(--foreground-muted)]">/seat</span>
              </div>
              <p className="text-sm text-[var(--foreground-muted)] mt-1">Up to {plan.seat_limit} employees</p>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--surface-overlay)]">
          <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 animate-slide-up">
            <h2 className="text-lg font-semibold mb-4">{editingPlan ? "Edit Plan" : "Create Plan"}</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div><label className="label">Plan Name</label><input name="name" defaultValue={editingPlan?.name} className="input" required /></div>
              <div><label className="label">Seat Limit</label><input name="seat_limit" type="number" defaultValue={editingPlan?.seat_limit} className="input" required /></div>
              <div><label className="label">Per-Seat Rate (FJD)</label><input name="per_seat_rate" type="number" step="0.01" defaultValue={editingPlan?.per_seat_rate} className="input" required /></div>
              <div><label className="label">Description</label><textarea name="description" defaultValue={editingPlan?.description || ""} className="input" rows={2} /></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setEditingPlan(null); }} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1" style={{ backgroundColor: "#FF6B35" }}>{editingPlan ? "Save" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
