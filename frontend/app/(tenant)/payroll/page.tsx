"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/lib/hooks/useTenant";
import { createClient } from "@/lib/supabase/client";
import { Play, FileText, Download, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { formatCurrency, formatDate, calculatePAYE, calculateFNPF } from "@/lib/utils";
import type { PayrollRun, PayrollEntry, PayPeriod, Employee, Timesheet } from "@/types";

export default function PayrollPage() {
  const { tenant, role } = useTenant();
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isSendingPayslips, setIsSendingPayslips] = useState(false);
  const [payslipMessage, setPayslipMessage] = useState<string | null>(null);

  const handleSendPayslips = async (runId: string) => {
    setIsSendingPayslips(true);
    setPayslipMessage(null);
    try {
      const res = await fetch("/api/payroll/send-payslips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payrollRunId: runId }),
      });
      const result = await res.json();
      if (!res.ok) {
        setPayslipMessage(`Error: ${result.error || "Failed to send payslips"}`);
      } else {
        setPayslipMessage(
          `Sent ${result.sent} payslip${result.sent === 1 ? "" : "s"}` +
            (result.skipped > 0 ? ` (${result.skipped} skipped — no email on file)` : "")
        );
      }
    } catch (err: any) {
      setPayslipMessage(`Error: ${err?.message || "Network error"}`);
    }
    setIsSendingPayslips(false);
  };
  const [showRunDetails, setShowRunDetails] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!tenant) return;
    loadData();
  }, [tenant]);

  const loadData = async () => {
    const { data: periodData } = await supabase
      .from("pay_periods")
      .select("*")
      .eq("tenant_id", tenant!.id)
      .order("start_date", { ascending: false });

    const { data: runData } = await supabase
      .from("payroll_runs")
      .select("*, pay_period:pay_periods(*)")
      .eq("tenant_id", tenant!.id)
      .order("run_at", { ascending: false });

    setPeriods(periodData || []);
    setRuns(runData || []);
  };

  const runPayroll = async (periodId: string) => {
    setIsRunning(true);

    const period = periods.find((p) => p.id === periodId);
    if (!period) {
      alert("Could not find this pay period.");
      setIsRunning(false);
      return;
    }

    const { data: timesheets, error: timesheetsError } = await supabase
      .from("timesheets")
      .select("*, employee:employees(*)")
      .eq("tenant_id", tenant!.id)
      .eq("pay_period_start", period.start_date)
      .eq("pay_period_end", period.end_date)
      .eq("status", "approved");

    if (timesheetsError) {
      alert(`Failed to load timesheets: ${timesheetsError.message}`);
      setIsRunning(false);
      return;
    }

    if (!timesheets || timesheets.length === 0) {
      alert("No approved timesheets for this period. Approve timesheets before running payroll.");
      setIsRunning(false);
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      alert("You must be signed in to run payroll.");
      setIsRunning(false);
      return;
    }

    const { data: run, error: runError } = await supabase
      .from("payroll_runs")
      .insert({
        tenant_id: tenant!.id,
        pay_period_id: periodId,
        run_by: userData.user.id,
        status: "draft",
      })
      .select()
      .single();

    if (runError || !run) {
      alert(`Failed to create payroll run: ${runError?.message || "unknown error"}`);
      setIsRunning(false);
      return;
    }

    let totalGross = 0;
    let totalNet = 0;

    for (const ts of timesheets) {
      const emp = ts.employee as Employee;
      const regularHours = ts.regular_hours || 0;
      const overtimeHours = ts.overtime_hours || 0;
      const hourlyRate = emp.hourly_rate;
      const otMultiplier = 1.5;

      const regularPay = regularHours * hourlyRate;
      const overtimePay = overtimeHours * hourlyRate * otMultiplier;
      const grossPay = regularPay + overtimePay;

      const fnpf = calculateFNPF(grossPay);

      // Approximate annual gross for PAYE (fortnightly = 26 periods)
      const periodsPerYear = tenant?.pay_period_frequency === "weekly" ? 52 :
                            tenant?.pay_period_frequency === "monthly" ? 12 : 26;
      const annualGross = grossPay * periodsPerYear;
      const paye = calculatePAYE(annualGross) / periodsPerYear;

      const netPay = grossPay - fnpf.employee - paye;

      await supabase.from("payroll_entries").insert({
        payroll_run_id: run.id,
        employee_id: emp.id,
        timesheet_id: ts.id,
        regular_hours: regularHours,
        overtime_hours: overtimeHours,
        hourly_rate: hourlyRate,
        overtime_multiplier: otMultiplier,
        gross_pay: grossPay,
        fnpf_employee_contribution: fnpf.employee,
        fnpf_employer_contribution: fnpf.employer,
        paye_tax: paye,
        net_pay: netPay,
      });

      totalGross += grossPay;
      totalNet += netPay;
    }

    await supabase
      .from("payroll_runs")
      .update({ total_gross: totalGross, total_net: totalNet })
      .eq("id", run.id);

    loadData();
    setIsRunning(false);
  };

  const finalizeRun = async (runId: string) => {
    const { error } = await supabase.from("payroll_runs").update({ status: "finalized" }).eq("id", runId);
    if (error) {
      alert(`Failed to finalize: ${error.message}`);
      return;
    }
    setSelectedRun((prev) => (prev && prev.id === runId ? { ...prev, status: "finalized" } : prev));
    loadData();
  };

  const viewRun = async (run: PayrollRun) => {
    if (showRunDetails === run.id) {
      setShowRunDetails(null);
      return;
    }
    setSelectedRun(run);
    setShowRunDetails(run.id);
    const { data } = await supabase
      .from("payroll_entries")
      .select("*, employee:employees(employee_code, hourly_rate, bank_name, bank_account_number, fnpf_number, profile:profiles(full_name))")
      .eq("payroll_run_id", run.id);
    setEntries(data || []);
  };

  const generateBredBankFile = (run: PayrollRun) => {
    const bredEntries = entries.filter((e) => (e.employee as any)?.bank_name === "BRED");

    if (bredEntries.length === 0) {
      alert("No employees with BRED bank on file for this payroll run.");
      return;
    }

    const escapeCsv = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const header = "BIC,Employee Name,Employee Id,Account Number,Amount,Purpose of transfer,Note (optional)";
    const rows = bredEntries.map((e) => {
      const emp = e.employee as any;
      const name = (emp?.profile?.full_name || "").slice(0, 35);
      const employeeId = (emp?.employee_code || "").slice(0, 25);
      const accountNumber = (emp?.bank_account_number || "").slice(0, 16);
      const amount = Number(e.net_pay).toFixed(2);
      const purpose = "Salary payment".slice(0, 140);
      const note = "";

      return [
        "BREDFJFJ",
        escapeCsv(name),
        employeeId,
        accountNumber,
        amount,
        escapeCsv(purpose),
        note,
      ].join(",");
    });

    const csvContent = [header, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bred_bank_batch_${run.id.slice(0, 8)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    supabase.from("compliance_files").insert({
      tenant_id: tenant!.id,
      payroll_run_id: run.id,
      file_type: "bred_bank_batch",
    });
  };

  const generateComplianceFile = (run: PayrollRun, type: "bank_batch" | "fnpf" | "frcs_paye") => {
    let csvContent = "";
    let filename = "";

    if (type === "bank_batch") {
      csvContent = "Employee Name,Account Name,Account Number,Bank Code,Net Payment Amount,Payment Reference\n";
      csvContent += entries.map((e) => {
        const name = (e.employee as any)?.profile?.full_name || e.employee_id.slice(0, 8);
        return `${name},${name},00000000,01,${e.net_pay.toFixed(2)},SALARY_${run.id.slice(0, 8)}`;
      }).join("\n");
      filename = `bank_batch_${run.id.slice(0, 8)}.csv`;
    } else if (type === "fnpf") {
      csvContent = "Employer Reference,Employee FNPF Number,Wages for Period,Employee Contribution,Employer Contribution\n";
      csvContent += entries.map((e) => {
        const name = (e.employee as any)?.profile?.full_name || e.employee_id.slice(0, 8);
        return `REF001,${e.employee_id.slice(0, 8)},${e.gross_pay.toFixed(2)},${e.fnpf_employee_contribution.toFixed(2)},${e.fnpf_employer_contribution.toFixed(2)}`;
      }).join("\n");
      filename = `fnpf_${run.id.slice(0, 8)}.csv`;
    } else {
      csvContent = "Employer Reference,Employee Tax ID,Gross Wages,PAYE Tax Withheld\n";
      csvContent += entries.map((e) => {
        return `REF001,${e.employee_id.slice(0, 8)},${e.gross_pay.toFixed(2)},${e.paye_tax.toFixed(2)}`;
      }).join("\n");
      filename = `frcs_paye_${run.id.slice(0, 8)}.csv`;
    }

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Log compliance file generation
    supabase.from("compliance_files").insert({
      tenant_id: tenant!.id,
      payroll_run_id: run.id,
      file_type: type,
      file_name: filename,
      file_url: filename,
      generated_by: "system",
      period_start: run.pay_period?.start_date || new Date().toISOString(),
      period_end: run.pay_period?.end_date || new Date().toISOString(),
    });
  };

  if (role !== "admin") {
    return (
      <div className="empty-state py-16">
        <AlertCircle className="h-8 w-8 text-[var(--foreground-muted)] mb-3" />
        <p className="text-[var(--foreground-muted)]">Payroll access is restricted to administrators</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <h1 className="section-title">Payroll</h1>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Pay Periods</h2>
        {periods.length === 0 ? (
          <div className="empty-state py-8">
            <p className="text-[var(--foreground-muted)]">No pay periods created</p>
            <p className="text-xs text-[var(--foreground-muted)] mt-1">Create a pay period in Settings to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {periods.map((period) => {
              const run = runs.find((r) => r.pay_period_id === period.id);
              return (
                <div key={period.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface-elevated)]">
                  <div>
                    <p className="font-medium text-sm">
                      {formatDate(period.start_date)} – {formatDate(period.end_date)}
                    </p>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      {run
                        ? `${run.status} · ${formatCurrency(run.total_net || 0)} net · ${formatCurrency(run.total_gross || 0)} gross`
                        : "Not run yet"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!run && (
                      <button
                        onClick={() => runPayroll(period.id)}
                        disabled={isRunning}
                        className="btn-primary text-xs py-2 px-3"
                      >
                        <Play className="h-3 w-3 mr-1" />
                        {isRunning ? "Running..." : "Run Payroll"}
                      </button>
                    )}
                    {run && (
                      <button onClick={() => viewRun(run)} className="btn-secondary text-xs py-2 px-3">
                        <FileText className="h-3 w-3 mr-1" />
                        {showRunDetails === run.id ? "Hide" : "Details"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedRun && showRunDetails === selectedRun.id && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold">Payroll Run Details</h2>
              <p className="text-sm text-[var(--foreground-muted)]">
                {formatDate(selectedRun.pay_period?.start_date || "")} – {formatDate(selectedRun.pay_period?.end_date || "")}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {selectedRun.status === "draft" && (
                <button onClick={() => finalizeRun(selectedRun.id)} className="btn-primary text-xs">
                  Finalize Run
                </button>
              )}
              <button
                onClick={() => handleSendPayslips(selectedRun.id)}
                disabled={isSendingPayslips}
                className="btn-primary text-xs"
              >
                {isSendingPayslips ? "Sending..." : "Send Payslips"}
              </button>
              <button onClick={() => generateBredBankFile(selectedRun)} className="btn-secondary text-xs">
                <Download className="h-3 w-3 mr-1" />BRED Bank CSV
              </button>
              <button onClick={() => generateComplianceFile(selectedRun, "bank_batch")} className="btn-secondary text-xs">
                <Download className="h-3 w-3 mr-1" />Bank CSV
              </button>
              <button onClick={() => generateComplianceFile(selectedRun, "fnpf")} className="btn-secondary text-xs">
                <Download className="h-3 w-3 mr-1" />FNPF CSV
              </button>
              <button onClick={() => generateComplianceFile(selectedRun, "frcs_paye")} className="btn-secondary text-xs">
                <Download className="h-3 w-3 mr-1" />FRCS CSV
              </button>
            </div>
            {payslipMessage && (
              <p className={`text-xs mt-2 ${payslipMessage.startsWith("Error") ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>
                {payslipMessage}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[var(--surface-elevated)]">
              <p className="text-xs text-[var(--foreground-muted)]">Total Gross</p>
              <p className="text-lg font-semibold mt-1">{formatCurrency(selectedRun.total_gross || 0)}</p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--surface-elevated)]">
              <p className="text-xs text-[var(--foreground-muted)]">Total Net</p>
              <p className="text-lg font-semibold mt-1">{formatCurrency(selectedRun.total_net || 0)}</p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--surface-elevated)]">
              <p className="text-xs text-[var(--foreground-muted)]">Employees</p>
              <p className="text-lg font-semibold mt-1">{entries.length}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 font-medium text-[var(--foreground-muted)]">Employee</th>
                  <th className="text-right py-2 font-medium text-[var(--foreground-muted)]">Hours</th>
                  <th className="text-right py-2 font-medium text-[var(--foreground-muted)]">Gross</th>
                  <th className="text-right py-2 font-medium text-[var(--foreground-muted)]">FNPF</th>
                  <th className="text-right py-2 font-medium text-[var(--foreground-muted)]">PAYE</th>
                  <th className="text-right py-2 font-medium text-[var(--foreground-muted)]">Net</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-3">{(entry.employee as any)?.profile?.full_name || entry.employee_id.slice(0, 8)}</td>
                    <td className="py-3 text-right text-[var(--foreground-muted)]">
                      {(entry.regular_hours + entry.overtime_hours).toFixed(1)}h
                    </td>
                    <td className="py-3 text-right">{formatCurrency(entry.gross_pay)}</td>
                    <td className="py-3 text-right text-[var(--foreground-muted)]">{formatCurrency(entry.fnpf_employee_contribution)}</td>
                    <td className="py-3 text-right text-[var(--foreground-muted)]">{formatCurrency(entry.paye_tax)}</td>
                    <td className="py-3 text-right font-medium">{formatCurrency(entry.net_pay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
