"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/lib/hooks/useTenant";
import { createClient } from "@/lib/supabase/client";
import { Users, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

export default function ReportsPage() {
  const { tenant, role } = useTenant();
  const [headcount, setHeadcount] = useState(0);
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [payrollData, setPayrollData] = useState<any[]>([]);
  const [violationCount, setViolationCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    if (!tenant) return;
    loadReports();
  }, [tenant]);

  const loadReports = async () => {
    // Headcount
    const { count } = await supabase
      .from("employees")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant!.id)
      .eq("is_active", true);
    setHeadcount(count || 0);

    // Attendance trend (last 7 days)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split("T")[0];
    });

    const attendanceTrend = await Promise.all(
      days.map(async (day) => {
        const { count } = await supabase
          .from("shifts")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenant!.id)
          .gte("clock_in_at", `${day}T00:00:00`)
          .lte("clock_in_at", `${day}T23:59:59`);
        return { day: day.slice(5), shifts: count || 0 };
      })
    );
    setAttendanceData(attendanceTrend);

    // Payroll trend (last 6 runs)
    const { data: runs } = await supabase
      .from("payroll_runs")
      .select("run_at, total_net")
      .eq("tenant_id", tenant!.id)
      .eq("status", "finalized")
      .order("run_at", { ascending: false })
      .limit(6);

    setPayrollData(
      (runs || [])
        .reverse()
        .map((r) => ({
          period: r.run_at.slice(0, 10),
          amount: r.total_net,
        }))
    );

    // Violations
    const { count: vCount } = await supabase
      .from("geofence_violations")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant!.id)
      .is("acknowledged_at", null);
    setViolationCount(vCount || 0);
  };

  if (role !== "admin") {
    return (
      <div className="empty-state py-16">
        <p className="text-[var(--foreground-muted)]">Reports are only available to administrators</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-slide-up">
      <h1 className="section-title">Reports</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-[var(--accent)]/10">
              <Users className="h-5 w-5 text-[var(--accent)]" />
            </div>
          </div>
          <p className="text-2xl font-semibold">{headcount}</p>
          <p className="text-sm text-[var(--foreground-muted)] mt-0.5">Active Employees</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-[var(--warning)]/10">
              <AlertTriangle className="h-5 w-5 text-[var(--warning)]" />
            </div>
          </div>
          <p className="text-2xl font-semibold">{violationCount}</p>
          <p className="text-sm text-[var(--foreground-muted)] mt-0.5">Open Geofence Alerts</p>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-6">Attendance Trend (Last 7 Days)</h2>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={attendanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" stroke="var(--foreground-muted)" fontSize={12} />
              <YAxis stroke="var(--foreground-muted)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="shifts" fill="var(--accent)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {payrollData.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-6">Payroll Cost Trend</h2>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={payrollData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="period" stroke="var(--foreground-muted)" fontSize={12} />
                <YAxis
                  stroke="var(--foreground-muted)"
                  fontSize={12}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                  }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ fill: "var(--accent)", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
