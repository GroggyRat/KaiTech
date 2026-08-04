"use client";

import { useEffect, useState, useCallback } from "react";
import { useTenant } from "@/lib/hooks/useTenant";
import { createClient } from "@/lib/supabase/client";
import dynamic from "next/dynamic";
import { Plus, Check, X, Trash2, MapPin, AlertCircle } from "lucide-react";
import type { WorkSite } from "@/types";

const SiteMap = dynamic(() => import("@/components/work-sites/SiteMap"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center text-[var(--foreground-muted)]">Loading map...</div>
  ),
});

export default function WorkSitesPage() {
  const { tenant, role } = useTenant();
  const [sites, setSites] = useState<WorkSite[]>([]);
  const [pendingSites, setPendingSites] = useState<WorkSite[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newSite, setNewSite] = useState<{ lat: number; lng: number; radius: number; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!tenant) return;
    loadSites();
  }, [tenant]);

  const loadSites = async () => {
    const { data } = await supabase
      .from("work_sites")
      .select("*")
      .eq("tenant_id", tenant!.id)
      .in("status", ["active", "pending"])
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    const active = (data || []).filter((s) => s.status === "active");
    const pending = (data || []).filter((s) => s.status === "pending");
    setSites(active);
    setPendingSites(pending);
    setIsLoading(false);
  };

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setNewSite({ lat, lng, radius: 100, name: "" });
    setIsAdding(false);
  }, []);

  const handleSave = async () => {
    if (!newSite || !tenant) return;
    setSaveError(null);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setSaveError("You must be signed in to save a site.");
      return;
    }

    const { error } = await supabase.from("work_sites").insert({
      tenant_id: tenant.id,
      name: newSite.name || "Unnamed Site",
      location: `POINT(${newSite.lng} ${newSite.lat})`,
      radius_meters: newSite.radius,
      status: role === "manager" ? "pending" : "active",
      created_by: userData.user.id,
    });

    if (!error) {
      setNewSite(null);
      loadSites();
    } else {
      setSaveError(error.message);
    }
  };

  const handleApprove = async (siteId: string) => {
    const { data: userData } = await supabase.auth.getUser();
    await supabase
      .from("work_sites")
      .update({
        status: "active",
        approved_by: userData.user?.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", siteId);
    loadSites();
  };

  const handleDelete = async (siteId: string) => {
    if (confirm("Delete this work site? Past attendance records will not be affected.")) {
      await supabase.from("work_sites").update({ is_active: false }).eq("id", siteId);
      loadSites();
    }
  };

  const isAdmin = role === "admin";
  const isManager = role === "manager";

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="section-title">Work Sites</h1>
        <button
          onClick={() => { setIsAdding(true); setNewSite(null); }}
          className={`btn-primary ${isAdding ? "opacity-75" : ""}`}
        >
          <Plus className="h-4 w-4 mr-2" />
          {isAdding ? "Click map to place center" : "Add Site"}
        </button>
      </div>

      {pendingSites.length > 0 && isAdmin && (
        <div className="card border-l-4 border-l-[var(--warning)]">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[var(--warning)]" />
            Pending Approvals ({pendingSites.length})
          </h2>
          <div className="space-y-2">
            {pendingSites.map((site) => (
              <div key={site.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface-elevated)]">
                <div>
                  <p className="font-medium text-sm">{site.name}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">
                    Radius: {site.radius_meters}m · Submitted by manager
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleApprove(site.id)} className="p-2 rounded-lg bg-[var(--success)]/10 text-[var(--success)] hover:bg-[var(--success)]/20 transition-colors">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(site.id)} className="p-2 rounded-lg bg-[var(--danger)]/10 text-[var(--danger)] hover:bg-[var(--danger)]/20 transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden" style={{ height: "480px" }}>
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-[var(--foreground-muted)]">Loading map...</div>
        ) : (
          <SiteMap
            sites={sites}
            isAdding={isAdding}
            newSite={newSite}
            onMapClick={handleMapClick}
          />
        )}
      </div>

      {newSite && (
        <div className="card space-y-4">
          <h3 className="font-medium">New Site Details</h3>
          <div>
            <label className="label">Site Name</label>
            <input
              value={newSite.name}
              onChange={(e) => setNewSite((s) => (s ? { ...s, name: e.target.value } : null))}
              className="input"
              placeholder="e.g., Warehouse — Suva"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Radius: {newSite.radius}m</label>
            <input
              type="range"
              min={50}
              max={1000}
              step={10}
              value={newSite.radius}
              onChange={(e) => setNewSite((s) => (s ? { ...s, radius: parseInt(e.target.value) } : null))}
              className="w-full accent-[var(--accent)]"
            />
            <div className="flex justify-between text-xs text-[var(--foreground-muted)] mt-1">
              <span>50m</span>
              <span>1000m</span>
            </div>
          </div>
          {saveError && (
            <div className="flex items-center gap-2 text-sm text-[var(--danger)] bg-[var(--danger)]/10 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => { setNewSite(null); setSaveError(null); }} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} className="btn-primary">
              {role === "manager" ? "Submit for Approval" : "Save Site"}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sites.map((site) => (
          <div key={site.id} className="card">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-[var(--accent)]/10 shrink-0">
                  <MapPin className="h-4 w-4 text-[var(--accent)]" />
                </div>
                <div>
                  <h3 className="font-medium text-sm">{site.name}</h3>
                  <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                    {site.radius_meters}m radius
                  </p>
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => handleDelete(site.id)}
                  className="p-1.5 rounded-lg hover:bg-[var(--surface-elevated)] text-[var(--danger)] transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


