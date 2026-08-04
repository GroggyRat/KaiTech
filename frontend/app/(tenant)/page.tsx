"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/lib/hooks/useTenant";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { LayoutDashboard, Users, MapPin, CreditCard, AlertCircle, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function DashboardPage() {
  const { tenant, role } = useTenant();
  const { user } = useAuth();
  const [stats, setStats] = useState({
    activeEmployees: 0,
    clockedInNow: 0,
    pendingLeaves: 0,
    pendingTimesheets: 0,
    geofenceAlerts: 0,
  });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!tenant) return;
    loadDashboard();
  }, [tenant]);

  const loadDashboard = async () => {
    const { count: activeEmployees } = await supabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant!.id)
      .eq("is_active", true);

    const { count: clockedIn } = await supabase
      .from("shifts")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant!.id)
      .is("clock_out_at", null);

    const { count: pendingLeaves } = await supabase
      .from("leave_requests")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant!.id)
      .eq("status", "pending");

    const { count: pendingTimesheets } = await supabase
      .from("timesheets")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant!.id)
      .eq("status", "pending");

    const { count: geofenceAlerts } = await supabase
      .from("geofence_violations")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant!.id)
      .is("acknowledged_at", null);

    setStats({
      activeEmployees: activeEmployees || 0,
      clockedInNow: clockedIn || 0,
      pendingLeaves: pendingLeaves || 0,
      pendingTimesheets: pendingTimesheets || 0,
      geofenceAlerts: geofenceAlerts || 0,
    });

    const { data: shifts } = await supabase
      .from("shifts")
      .select("*, employee:employees(profile:profiles(full_name))")
      .eq("tenant_id", tenant!.id)
      .order("clock_in_at", { ascending: false })
      .limit(8);

    setRecentActivity(shifts || []);
    setIsLoading(false);
  };

  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isEmployee = role === "employee";

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="space-y-8 animate-slide-up">
      <div>
        <h1 className="section-title">
          {user?.full_name ? `${greeting()}, ${user.full_name.split(" ")[0]}` : "Dashboard"}
        </h1>
        <p className="text-[var(--foreground-muted)] mt-1">
          {formatDate(new Date().toISOString())} · {tenant?.name}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(isAdmin || isManager) && (
          <DashboardCard label="Active Employees" value={stats.activeEmployees} icon={Users} href="/employees/" />
        )}
        <DashboardCard label="Clocked In Now" value={stats.clockedInNow} icon={Clock} href="/attendance/" />
        {(isAdmin || isManager) && (
          <DashboardCard label="Pending Leave" value={stats.pendingLeaves} icon={AlertCircle} href="/leave/" />
        )}
        {(isAdmin || isManager) && (
          <DashboardCard label="Pending Timesheets" value={stats.pendingTimesheets} icon={CreditCard} href="/timesheets/" />
        )}
        {isAdmin && stats.geofenceAlerts > 0 && (
          <DashboardCard label="Geofence Alerts" value={stats.geofenceAlerts} icon={MapPin} href="/attendance/" />
        )}
      </div>

      {isEmployee && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link href="/attendance/" className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--accent)]/5 transition-colors">
              <Clock className="h-6 w-6 text-[var(--accent)]" />
              <span className="text-sm font-medium">Clock In</span>
            </Link>
            <Link href="/leave/" className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--accent)]/5 transition-colors">
              <AlertCircle className="h-6 w-6 text-[var(--accent)]" />
              <span className="text-sm font-medium">Request Leave</span>
            </Link>
            <Link href="/timesheets/" className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--accent)]/5 transition-colors">
              <CreditCard className="h-6 w-6 text-[var(--accent)]" />
              <span className="text-sm font-medium">My Timesheets</span>
            </Link>
            <Link href="/documents/" className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--surface-elevated)] hover:bg-[var(--accent)]/5 transition-colors">
              <LayoutDashboard className="h-6 w-6 text-[var(--accent)]" />
              <span className="text-sm font-medium">Documents</span>
            </Link>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        {isLoading ? (
          <div className="py-8 text-center text-[var(--foreground-muted)]">Loading activity...</div>
        ) : recentActivity.length === 0 ? (
          <div className="empty-state py-8">
            <p className="text-[var(--foreground-muted)]">No recent clock-in activity</p>
          </div>
        ) : (
          <div className="space-y-1">
            {recentActivity.map((shift) => (
              <div
                key={shift.id}
                className="flex items-center justify-between py-3 px-2 rounded-xl hover:bg-[var(--surface-elevated)]/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full shrink-0 ${shift.clock_out_at ? "bg-[var(--foreground-muted)]" : "bg-[var(--success)] animate-pulse"}`} />
                  <div>
                    <p className="font-medium text-sm">{shift.employee?.profile?.full_name || "Unknown"}</p>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      {shift.clock_out_at ? "Clocked out" : "Currently clocked in"} · {formatDate(shift.clock_in_at)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {shift.clock_out_at ? (
                    <span className="text-sm text-[var(--foreground-muted)]">
                      {shift.total_hours?.toFixed(1)}h
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--success)] font-medium">
                      Active
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardCard({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  href: string;
}) {
  return (
    <Link href={href} className="card hover:shadow-lg transition-all duration-200">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-xl bg-[var(--accent)]/10">
          <Icon className="h-5 w-5 text-[var(--accent)]" />
        </div>
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-[var(--foreground-muted)] mt-0.5">{label}</p>
    </Link>
  );
}
