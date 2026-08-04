"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/lib/hooks/useTenant";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { Check, X, Clock, FileText, AlertCircle, RefreshCw, Pencil } from "lucide-react";
import { formatDuration, formatDate } from "@/lib/utils";
import type { Timesheet, PayPeriod } from "@/types";

export default function TimesheetsPage() {
  const { tenant, role } = useTenant();
  const { user } = useAuth();
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateMessage, setGenerateMessage] = useState<string | null>(null);
  const [todayHours, setTodayHours] = useState<{ completed: number; activeElapsed: number } | null>(null);
  const [myPayslips, setMyPayslips] = useState<any[]>([]);
  const supabase = createClient();

  useEffect(() => {
    if (!tenant) return;
    loadTimesheets();
    loadPeriods();
    loadTodayHours();
    loadMyPayslips();
    const interval = setInterval(loadTodayHours, 60000);
    return () => clearInterval(interval);
  }, [tenant]);

  const loadMyPayslips = async () => {
    if (!user) return;
    const { data: empData } = await supabase
      .from("employees")
      .select("id, hourly_rate, profile:profiles(full_name)")
      .eq("profile_id", user.id)
      .eq("tenant_id", tenant!.id)
      .single();
    if (!empData) return;

    const { data } = await supabase
      .from("payroll_entries")
      .select("*, payroll_run:payroll_runs(pay_period:pay_periods(start_date, end_date), run_at, status)")
      .eq("employee_id", empData.id)
      .order("created_at", { ascending: false });

    setMyPayslips((data || []).map((d: any) => ({ ...d, employeeName: (empData as any).profile?.full_name })));
  };

  const loadTodayHours = async () => {
    if (!user) return;
    const { data: empData } = await supabase
      .from("employees")
      .select("id")
      .eq("profile_id", user.id)
      .eq("tenant_id", tenant!.id)
      .single();
    if (!empData) return;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data: todayShifts } = await supabase
      .from("shifts")
      .select("clock_in_at, clock_out_at, total_hours")
      .eq("employee_id", empData.id)
      .gte("clock_in_at", startOfDay.toISOString());

    let completed = 0;
    let activeElapsed = 0;
    (todayShifts || []).forEach((s) => {
      if (s.clock_out_at) {
        completed += s.total_hours || 0;
      } else {
        activeElapsed = (Date.now() - new Date(s.clock_in_at).getTime()) / 1000 / 60 / 60;
      }
    });
    setTodayHours({ completed, activeElapsed });
  };

  const loadPeriods = async () => {
    const { data } = await supabase
      .from("pay_periods")
      .select("*")
      .eq("tenant_id", tenant!.id)
      .order("start_date", { ascending: false });
    setPeriods(data || []);
    if (data && data.length > 0 && !selectedPeriodId) {
      setSelectedPeriodId(data[0].id);
    }
  };

  const handleDownloadPayslip = async (entry: any) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    const period = entry.payroll_run?.pay_period;

    doc.setFontSize(16);
    doc.text("Payslip", 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`${tenant?.name || ""}`, 14, 25);

    doc.setTextColor(0);
    doc.setFontSize(11);
    let y = 40;
    const line = (label: string, value: string) => {
      doc.setFont("helvetica", "normal");
      doc.text(label, 14, y);
      doc.setFont("helvetica", "bold");
      doc.text(value, 140, y);
      y += 8;
    };

    line("Employee", entry.employeeName || "");
    line("Pay Period", period ? `${formatDate(period.start_date)} - ${formatDate(period.end_date)}` : "");
    y += 4;
    doc.setDrawColor(200);
    doc.line(14, y, 196, y);
    y += 10;

    line("Regular Hours", `${entry.regular_hours}`);
    line("Overtime Hours", `${entry.overtime_hours}`);
    line("Hourly Rate", `$${Number(entry.hourly_rate).toFixed(2)}`);
    y += 4;
    doc.line(14, y, 196, y);
    y += 10;

    line("Gross Pay", `$${Number(entry.gross_pay).toFixed(2)}`);
    if (entry.allowances) line("Allowances", `$${Number(entry.allowances).toFixed(2)}`);
    line("FNPF (Employee)", `-$${Number(entry.fnpf_employee_contribution).toFixed(2)}`);
    line("PAYE Tax", `-$${Number(entry.paye_tax).toFixed(2)}`);
    if (entry.deductions) line("Other Deductions", `-$${Number(entry.deductions).toFixed(2)}`);
    y += 4;
    doc.line(14, y, 196, y);
    y += 10;
    doc.setFontSize(13);
    line("Net Pay", `$${Number(entry.net_pay).toFixed(2)}`);

    doc.save(`payslip-${period ? formatDate(period.start_date) : "period"}.pdf`);
  };

  const handleGenerate = async () => {
    if (!selectedPeriodId) return;
    setIsGenerating(true);
    setGenerateError(null);
    setGenerateMessage(null);

    const { data, error } = await supabase.rpc("generate_timesheets_for_period", {
      p_pay_period_id: selectedPeriodId,
    });

    if (error) {
      setGenerateError(error.message);
    } else {
      const count = data?.length || 0;
      setGenerateMessage(
        count === 0
          ? "No completed shifts found for this pay period."
          : `Generated timesheets for ${count} employee${count === 1 ? "" : "s"}.`
      );
      loadTimesheets();
    }
    setIsGenerating(false);
  };

  const loadTimesheets = async () => {
    const { data } = await supabase
      .from("timesheets")
      .select("*, employee:employees(profile:profiles(full_name))")
      .eq("tenant_id", tenant!.id)
      .order("pay_period_start", { ascending: false });
    setTimesheets(data || []);
    setIsLoading(false);
  };

  const handleApprove = async (id: string) => {
    await supabase.from("timesheets").update({ status: "approved" }).eq("id", id);
    loadTimesheets();
  };

  const handleReject = async (id: string) => {
    await supabase.from("timesheets").update({ status: "rejected" }).eq("id", id);
    loadTimesheets();
  };

  const isAdminOrManager = role === "admin" || role === "manager";
  const isEmployee = role === "employee";

  const myTimesheets = isEmployee
    ? timesheets.filter((ts) => ts.employee_id === "self") // Will be filtered by RLS
    : timesheets;

  const pendingTimesheets = timesheets.filter((ts) => ts.status === "pending");
  const approvedTimesheets = timesheets.filter((ts) => ts.status === "approved");
  const rejectedTimesheets = timesheets.filter((ts) => ts.status === "rejected");

  return (
    <div className="space-y-6 animate-slide-up">
      <h1 className="section-title">Timesheets</h1>

      {role === "admin" && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-1">Generate Timesheets</h2>
          <p className="text-sm text-[var(--foreground-muted)] mb-4">
            Aggregate completed clock in/out shifts into timesheets for a pay period.
          </p>
          {periods.length === 0 ? (
            <p className="text-sm text-[var(--foreground-muted)]">
              No pay periods yet — create one in Settings first.
            </p>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                className="input max-w-xs"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatDate(p.start_date)} – {formatDate(p.end_date)}
                  </option>
                ))}
              </select>
              <button onClick={handleGenerate} disabled={isGenerating} className="btn-primary text-sm">
                <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? "animate-spin" : ""}`} />
                {isGenerating ? "Generating..." : "Generate Timesheets"}
              </button>
            </div>
          )}
          {generateError && (
            <p className="text-sm text-[var(--danger)] mt-3">{generateError}</p>
          )}
          {generateMessage && (
            <p className="text-sm text-[var(--success)] mt-3">{generateMessage}</p>
          )}
        </div>
      )}

      {isEmployee && todayHours && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-1">Today's Hours</h2>
          <p className="text-sm text-[var(--foreground-muted)] mb-3">
            Live total for today — updates automatically.
          </p>
          <p className="text-3xl font-semibold">
            {formatDuration(todayHours.completed + todayHours.activeElapsed)}
          </p>
          {todayHours.activeElapsed > 0 && (
            <p className="text-xs text-[var(--success)] mt-1">Currently clocked in</p>
          )}
        </div>
      )}

      {isEmployee && myPayslips.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">My Payslips</h2>
          <div className="space-y-2">
            {myPayslips.map((entry) => {
              const period = entry.payroll_run?.pay_period;
              return (
                <div key={entry.id} className="flex items-center justify-between p-4 rounded-xl bg-[var(--surface-elevated)]">
                  <div>
                    <p className="font-medium text-sm">
                      {period ? `${formatDate(period.start_date)} – ${formatDate(period.end_date)}` : "Pay period"}
                    </p>
                    <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                      Net pay: ${Number(entry.net_pay).toFixed(2)}
                    </p>
                  </div>
                  <button onClick={() => handleDownloadPayslip(entry)} className="btn-secondary text-xs py-1.5 px-3">
                    Download PDF
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isEmployee && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">My Timesheets</h2>
          {myTimesheets.length === 0 ? (
            <div className="empty-state py-8">
              <Clock className="h-8 w-8 text-[var(--foreground-muted)] mb-3" />
              <p className="text-[var(--foreground-muted)]">No timesheets yet</p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">Timesheets are generated automatically from your clock in/out data</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myTimesheets.map((ts) => (
                <TimesheetRow key={ts.id} timesheet={ts} />
              ))}
            </div>
          )}
        </div>
      )}

      {isAdminOrManager && (
        <>
          {pendingTimesheets.length > 0 && (
            <div className="card border-l-4 border-l-[var(--warning)]">
              <h2 className="text-lg font-semibold mb-4">Pending Approval ({pendingTimesheets.length})</h2>
              <div className="space-y-2">
                {pendingTimesheets.map((ts) => (
                  <TimesheetRow
                    key={ts.id}
                    timesheet={ts}
                    showActions
                    onApprove={() => handleApprove(ts.id)}
                    onReject={() => handleReject(ts.id)}
                    isAdmin={role === "admin"}
                    onUpdate={loadTimesheets}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="text-lg font-semibold mb-4">All Timesheets</h2>
            {timesheets.length === 0 ? (
              <div className="empty-state py-8">
                <Clock className="h-8 w-8 text-[var(--foreground-muted)] mb-3" />
                <p className="text-[var(--foreground-muted)]">No timesheets generated yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {timesheets.map((ts) => (
                  <TimesheetRow key={ts.id} timesheet={ts} isAdmin={role === "admin"} onUpdate={loadTimesheets} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TimesheetRow({
  timesheet,
  showActions,
  onApprove,
  onReject,
  isAdmin,
  onUpdate,
}: {
  timesheet: Timesheet;
  showActions?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  isAdmin?: boolean;
  onUpdate?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [regularHours, setRegularHours] = useState(String(timesheet.regular_hours));
  const [overtimeHours, setOvertimeHours] = useState(String(timesheet.overtime_hours));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  const handleSave = async () => {
    const reg = parseFloat(regularHours);
    const ot = parseFloat(overtimeHours);
    if (isNaN(reg) || isNaN(ot) || reg < 0 || ot < 0) {
      setError("Enter valid non-negative numbers.");
      return;
    }
    setIsSaving(true);
    setError("");
    const { error: updateError } = await supabase
      .from("timesheets")
      .update({ regular_hours: reg, overtime_hours: ot, total_hours: reg + ot })
      .eq("id", timesheet.id);

    if (updateError) {
      setError(updateError.message);
    } else {
      setIsEditing(false);
      onUpdate?.();
    }
    setIsSaving(false);
  };

  if (isEditing) {
    return (
      <div className="p-4 rounded-xl bg-[var(--surface-elevated)] space-y-3">
        <p className="font-medium text-sm">{(timesheet.employee as any)?.profile?.full_name || "Unknown"}</p>
        {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        <div className="flex items-center gap-3">
          <div>
            <label className="text-xs text-[var(--foreground-muted)]">Regular hours</label>
            <input
              type="number"
              min="0"
              step="0.25"
              value={regularHours}
              onChange={(e) => setRegularHours(e.target.value)}
              className="input text-sm py-1.5 w-24"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--foreground-muted)]">Overtime hours</label>
            <input
              type="number"
              min="0"
              step="0.25"
              value={overtimeHours}
              onChange={(e) => setOvertimeHours(e.target.value)}
              className="input text-sm py-1.5 w-24"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIsEditing(false)} className="btn-secondary text-xs py-1.5 px-3">Cancel</button>
          <button onClick={handleSave} disabled={isSaving} className="btn-primary text-xs py-1.5 px-3">
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-[var(--surface-elevated)]">
      <div className="min-w-0">
        <p className="font-medium text-sm">{(timesheet.employee as any)?.profile?.full_name || "Unknown"}</p>
        <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
          {formatDate(timesheet.pay_period_start)} – {formatDate(timesheet.pay_period_end)} · {formatDuration(timesheet.total_hours)}
        </p>
        <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
          Regular: {timesheet.regular_hours}h · Overtime: {timesheet.overtime_hours}h
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span
          className={`text-xs px-2.5 py-1 rounded-full capitalize font-medium ${
            timesheet.status === "approved"
              ? "bg-[var(--success)]/10 text-[var(--success)]"
              : timesheet.status === "rejected"
              ? "bg-[var(--danger)]/10 text-[var(--danger)]"
              : "bg-[var(--warning)]/10 text-[var(--warning)]"
          }`}
        >
          {timesheet.status}
        </span>
        {isAdmin && (
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 rounded-lg hover:bg-[var(--surface)] text-[var(--foreground-muted)] transition-colors"
            title="Edit hours"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
        {showActions && (
          <div className="flex gap-1">
            <button
              onClick={onApprove}
              className="p-1.5 rounded-lg bg-[var(--success)]/10 text-[var(--success)] hover:bg-[var(--success)]/20 transition-colors"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={onReject}
              className="p-1.5 rounded-lg bg-[var(--danger)]/10 text-[var(--danger)] hover:bg-[var(--danger)]/20 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
