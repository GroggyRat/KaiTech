import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsPDF } from "jspdf";

function generatePayslipPdf(entry: any, tenant: any, period: any): string | null {
  try {
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("Payslip", 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(tenant?.name || "", 14, 25);

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

    line("Employee", entry.employee?.profile?.full_name || "");
    line("Pay Period", period ? `${period.start_date} - ${period.end_date}` : "");
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

    const dataUri = doc.output("datauristring");
    const base64 = dataUri.split(",")[1];

    if (!base64 || base64.length < 100) {
      console.error("[Payslip API] PDF base64 too small or empty");
      return null;
    }

    return base64;
  } catch (err) {
    console.error("[Payslip API] PDF generation failed:", err);
    return null;
  }
}

function decodeJwtPayload(token: string): { sub: string } | null {
  try {
    const base64Payload = token.split(".")[1];
    if (!base64Payload) return null;
    const normalized = base64Payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    return JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const { payrollRunId } = await request.json();
  if (!payrollRunId) {
    return NextResponse.json({ error: "Missing payrollRunId" }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const payload = decodeJwtPayload(token);
  if (!payload?.sub) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const userId = payload.sub;
  const admin = createAdminClient();

  const { data: run } = await admin
    .from("payroll_runs")
    .select("*, pay_period:pay_periods(start_date, end_date)")
    .eq("id", payrollRunId)
    .single();

  if (!run) {
    return NextResponse.json({ error: "Payroll run not found" }, { status: 404 });
  }

  const { data: callerRole } = await admin
    .from("user_tenant_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", run.tenant_id)
    .single();

  if (callerRole?.role !== "admin") {
    return NextResponse.json({ error: "Only tenant admins can send payslips" }, { status: 403 });
  }

  const { data: tenant } = await admin
    .from("tenants")
    .select("name, logo_url, accent_color")
    .eq("id", run.tenant_id)
    .single();

  const { data: entries } = await admin
    .from("payroll_entries")
    .select("*, employee:employees(profile:profiles(full_name, email))")
    .eq("payroll_run_id", payrollRunId);

  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: "No payroll entries found for this run" }, { status: 404 });
  }

  const validEntries = entries.filter((e: any) => e.employee?.profile?.email);
  const skipped = entries.length - validEntries.length;

  let pdfFailures = 0;

  const batchPayload = validEntries.map((entry: any) => {
    const pdfBase64 = generatePayslipPdf(entry, tenant, run.pay_period);

    if (!pdfBase64) {
      pdfFailures++;
    }

    const email: any = {
      from: `${tenant?.name || "KaiWorkforce"} <payroll@workforce.kaimasala.com>`,
      to: entry.employee.profile.email,
      subject: `Your Payslip — ${run.pay_period?.start_date} to ${run.pay_period?.end_date}`,
      html: `<p>Hi ${entry.employee.profile.full_name},</p><p>Your payslip for this pay period is attached.</p><p>Net pay: <strong>$${Number(entry.net_pay).toFixed(2)}</strong></p><p>— ${tenant?.name || "KaiWorkforce"}</p>`,
    };

    // Only attach if PDF was generated successfully
    if (pdfBase64) {
      email.attachments = [
        {
          filename: "payslip.pdf",
          content: pdfBase64,
        },
      ];
    }

    return email;
  });

  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(batchPayload),
  });

  const responseText = await res.text();
  let result: any;
  try {
    result = JSON.parse(responseText);
  } catch {
    result = { message: responseText.slice(0, 200) };
  }

  if (!res.ok) {
    const errorMsg = result?.message || result?.error || `Resend error (${res.status})`;
    return NextResponse.json({ error: errorMsg }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    sent: validEntries.length,
    skipped,
    pdfFailures: pdfFailures > 0 ? pdfFailures : undefined,
    note: pdfFailures > 0
      ? `${pdfFailures} payslip(s) sent without PDF attachment due to generation error.`
      : undefined,
  });
}