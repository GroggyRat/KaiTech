"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/lib/hooks/useTenant";
import { createClient } from "@/lib/supabase/client";
import { Save, Bell, Palette, Globe, CalendarRange } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { PayPeriod } from "@/types";

function computeEndDate(startDate: string, frequency: string): string {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(start);
  if (frequency === "weekly") {
    end.setDate(end.getDate() + 6);
  } else if (frequency === "fortnightly") {
    end.setDate(end.getDate() + 13);
  } else {
    end.setMonth(end.getMonth() + 1);
    end.setDate(end.getDate() - 1);
  }
  return end.toISOString().slice(0, 10);
}

export default function SettingsPage() {
  const { tenant, role } = useTenant();
  const [activeTab, setActiveTab] = useState<"general" | "pay_periods" | "notifications" | "branding">("general");
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState({
    name: "",
    timezone: "Pacific/Fiji",
    currency: "FJD",
    pay_period_frequency: "fortnightly",
    accent_color: "#007AFF",
  });
  const [notificationSettings, setNotificationSettings] = useState<any[]>([]);
  const [payPeriods, setPayPeriods] = useState<PayPeriod[]>([]);
  const [newPeriodStart, setNewPeriodStart] = useState("");
  const [newPeriodEnd, setNewPeriodEnd] = useState("");
  const [periodError, setPeriodError] = useState("");
  const [isCreatingPeriod, setIsCreatingPeriod] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (!tenant) return;
    setSettings({
      name: tenant.name,
      timezone: tenant.timezone,
      currency: tenant.currency,
      pay_period_frequency: tenant.pay_period_frequency,
      accent_color: tenant.accent_color,
    });
    loadNotificationSettings();
    loadPayPeriods();
  }, [tenant]);

  const loadPayPeriods = async () => {
    const { data } = await supabase
      .from("pay_periods")
      .select("*")
      .eq("tenant_id", tenant!.id)
      .order("start_date", { ascending: false });
    setPayPeriods(data || []);

    // Suggest the day after the most recent period's end date as the next start date.
    if (data && data.length > 0) {
      const last = new Date(data[0].end_date + "T00:00:00");
      last.setDate(last.getDate() + 1);
      setNewPeriodStart(last.toISOString().slice(0, 10));
    } else {
      setNewPeriodStart(new Date().toISOString().slice(0, 10));
    }
  };

  const handleCreatePeriod = async () => {
    if (!newPeriodStart) return;
    setPeriodError("");
    setIsCreatingPeriod(true);

    const endDate = newPeriodEnd || computeEndDate(newPeriodStart, tenant!.pay_period_frequency);

    const { error } = await supabase.from("pay_periods").insert({
      tenant_id: tenant!.id,
      start_date: newPeriodStart,
      end_date: endDate,
      status: "open",
    });

    if (error) {
      setPeriodError(error.message);
    } else {
      setNewPeriodEnd("");
      loadPayPeriods();
    }
    setIsCreatingPeriod(false);
  };

  const loadNotificationSettings = async () => {
    const { data } = await supabase
      .from("notification_settings")
      .select("*, event:notification_events(*)")
      .eq("tenant_id", tenant!.id);
    setNotificationSettings(data || []);
  };

  const handleSave = async () => {
    if (!tenant) return;
    setIsSaving(true);
    await supabase
      .from("tenants")
      .update({
        name: settings.name,
        timezone: settings.timezone,
        currency: settings.currency,
        pay_period_frequency: settings.pay_period_frequency,
        accent_color: settings.accent_color,
      })
      .eq("id", tenant.id);
    setIsSaving(false);
    window.location.reload();
  };

  const toggleNotification = async (id: string, field: "in_app_enabled" | "email_enabled") => {
    const setting = notificationSettings.find((s) => s.id === id);
    if (!setting) return;
    await supabase
      .from("notification_settings")
      .update({ [field]: !setting[field] })
      .eq("id", id);
    loadNotificationSettings();
  };

  if (role !== "admin") {
    return (
      <div className="empty-state py-16">
        <p className="text-[var(--foreground-muted)]">Settings are only available to administrators</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <h1 className="section-title">Settings</h1>

      <div className="flex gap-1 p-1 rounded-2xl bg-[var(--surface-elevated)] w-fit">
        {(["general", "pay_periods", "notifications", "branding"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium transition-all",
              activeTab === tab
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            )}
          >
            {tab === "pay_periods" ? "Pay Periods" : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === "general" && (
        <div className="card space-y-5 max-w-xl">
          <div className="flex items-center gap-3 mb-2">
            <Globe className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="text-lg font-semibold">General</h2>
          </div>
          <div>
            <label className="label">Tenant Name</label>
            <input
              value={settings.name}
              onChange={(e) => setSettings((s) => ({ ...s, name: e.target.value }))}
              className="input"
            />
          </div>
          <div>
            <label className="label">Timezone</label>
            <select
              value={settings.timezone}
              onChange={(e) => setSettings((s) => ({ ...s, timezone: e.target.value }))}
              className="input"
            >
              <option value="Pacific/Fiji">Pacific/Fiji</option>
              <option value="Pacific/Auckland">Pacific/Auckland</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
          <div>
            <label className="label">Currency</label>
            <select
              value={settings.currency}
              onChange={(e) => setSettings((s) => ({ ...s, currency: e.target.value }))}
              className="input"
            >
              <option value="FJD">FJD — Fiji Dollar</option>
              <option value="USD">USD — US Dollar</option>
              <option value="AUD">AUD — Australian Dollar</option>
              <option value="NZD">NZD — New Zealand Dollar</option>
            </select>
          </div>
          <div>
            <label className="label">Pay Period Frequency</label>
            <select
              value={settings.pay_period_frequency}
              onChange={(e) => setSettings((s) => ({ ...s, pay_period_frequency: e.target.value }))}
              className="input"
            >
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <button onClick={handleSave} disabled={isSaving} className="btn-primary">
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}

      {activeTab === "pay_periods" && (
        <div className="card space-y-5 max-w-xl">
          <div className="flex items-center gap-3 mb-2">
            <CalendarRange className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="text-lg font-semibold">Pay Periods</h2>
          </div>
          <p className="text-sm text-[var(--foreground-muted)]">
            Create a pay period, then generate and approve timesheets for it before running payroll.
          </p>

          {periodError && (
            <div className="p-3 rounded-xl text-sm bg-[var(--danger)]/10 text-[var(--danger)]">{periodError}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start Date</label>
              <input
                type="date"
                value={newPeriodStart}
                onChange={(e) => {
                  setNewPeriodStart(e.target.value);
                  setNewPeriodEnd("");
                }}
                className="input"
              />
            </div>
            <div>
              <label className="label">End Date</label>
              <input
                type="date"
                value={newPeriodEnd || (newPeriodStart ? computeEndDate(newPeriodStart, settings.pay_period_frequency) : "")}
                onChange={(e) => setNewPeriodEnd(e.target.value)}
                className="input"
              />
            </div>
          </div>
          <p className="text-xs text-[var(--foreground-muted)] -mt-3">
            End date is suggested from your {settings.pay_period_frequency} frequency — adjust if needed.
          </p>
          <button onClick={handleCreatePeriod} disabled={isCreatingPeriod || !newPeriodStart} className="btn-primary">
            {isCreatingPeriod ? "Creating..." : "Create Pay Period"}
          </button>

          <div className="pt-4 border-t border-[var(--border)]">
            <h3 className="text-sm font-medium mb-3">Existing Pay Periods</h3>
            {payPeriods.length === 0 ? (
              <p className="text-sm text-[var(--foreground-muted)]">No pay periods yet.</p>
            ) : (
              <div className="space-y-2">
                {payPeriods.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--surface-elevated)] text-sm"
                  >
                    <span>{formatDate(p.start_date)} – {formatDate(p.end_date)}</span>
                    <span
                      className={cn(
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        p.status === "open"
                          ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                          : "bg-[var(--foreground-muted)]/10 text-[var(--foreground-muted)]"
                      )}
                    >
                      {p.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "notifications" && (
        <div className="card max-w-xl">
          <div className="flex items-center gap-3 mb-4">
            <Bell className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="text-lg font-semibold">Notification Preferences</h2>
          </div>
          {notificationSettings.length === 0 ? (
            <p className="text-[var(--foreground-muted)] text-sm">No notification settings configured</p>
          ) : (
            <div className="space-y-3">
              {notificationSettings.map((setting) => (
                <div key={setting.id} className="flex items-center justify-between py-3 border-b border-[var(--border)] last:border-0">
                  <div>
                    <p className="font-medium text-sm">{setting.event?.event_label}</p>
                    <p className="text-xs text-[var(--foreground-muted)]">{setting.event?.description}</p>
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={setting.in_app_enabled}
                        onChange={() => toggleNotification(setting.id, "in_app_enabled")}
                        className="rounded"
                      />
                      In-App
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={setting.email_enabled}
                        onChange={() => toggleNotification(setting.id, "email_enabled")}
                        className="rounded"
                      />
                      Email
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "branding" && (
        <div className="card space-y-5 max-w-xl">
          <div className="flex items-center gap-3 mb-2">
            <Palette className="h-5 w-5 text-[var(--accent)]" />
            <h2 className="text-lg font-semibold">Branding</h2>
          </div>
          <div>
            <label className="label">Accent Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={settings.accent_color}
                onChange={(e) => setSettings((s) => ({ ...s, accent_color: e.target.value }))}
                className="h-10 w-10 rounded-lg border-0 p-0 cursor-pointer"
              />
              <input
                value={settings.accent_color}
                onChange={(e) => setSettings((s) => ({ ...s, accent_color: e.target.value }))}
                className="input flex-1"
              />
            </div>
          </div>
          <div className="p-6 rounded-xl border border-[var(--border)]" style={{ backgroundColor: "#F5F5F7" }}>
            <p className="text-xs text-[var(--foreground-muted)] mb-2">Light Mode Preview</p>
            <button className="btn-primary" style={{ backgroundColor: settings.accent_color }}>
              Preview Button
            </button>
          </div>
          <div className="p-6 rounded-xl border border-[var(--border)] bg-[#1C1C1E]">
            <p className="text-xs text-[var(--foreground-muted)] mb-2">Dark Mode Preview</p>
            <button className="btn-primary" style={{ backgroundColor: settings.accent_color }}>
              Preview Button
            </button>
          </div>
          <button onClick={handleSave} disabled={isSaving} className="btn-primary">
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}
