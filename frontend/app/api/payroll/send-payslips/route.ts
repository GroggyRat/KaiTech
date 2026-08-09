import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsPDF } from "jspdf";

function generatePayslipPdf(entry: any, tenant: any, period: any): string {
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
  line("Hourly Rate", `$$${Number(entry.hourly_rate).toFixed(2)}`);
  y += 4;
  doc.line(14, y, 196, y);
  y += 10;

  line("Gross Pay", `$$${Number(entry.gross_pay).toFixed(2)}`);
  if (entry.allowances) line("Allowances", `$$${Number(entry.allowances).toFixed(2)}`);
  line("FNPF (Employee)", `-$${Number(entry.fnpf_employee_contribution).toFixed(2)}`);
  line("PAYE Tax", `-$${Number(entry.paye_tax).toFixed(2)}`);
  if (entry.deductions) line("Other Deductions", `-$${Number(entry.deductions).toFixed(2)}`);
  y += 4;
  doc.line(14, y, 196, y);
  y += 10;
  doc.setFontSize(13);
  line("Net Pay", `$$${Number(entry.net_pay).toFixed(2)}`);

  return doc.output("datauristring").split(",")[1];
}

function decodeJwtPayload(token: string): string | null {
  try {
    const base64Payload = token.split(".")[1];
    if (!base64Payload) return null;
    const normalized = base64Payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "="
    );
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
    return payload.sub || null;
  } catch {
    return null;
  }
}

function extractUserIdFromCookieValue(value: string): string | null {
  // Try raw JWT
  let userId = decodeJwtPayload(value);
  if (userId) return userId;

  // Try JSON array: ["access_token", "refresh_token"]
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length > 0) {
      userId = decodeJwtPayload(parsed[0]);
      if (userId) return userId;
    }
    if (typeof parsed === "object" && parsed.access_token) {
      userId = decodeJwtPayload(parsed.access_token);
      if (userId) return userId;
    }
  } catch {
    // not JSON
  }

  return null;
}

function getUserIdFromCookie(request: NextRequest): string | null {
  const allCookies = request.cookies.getAll();
  
  // Log every cookie name for debugging
  console.log("[Payslip API] All cookies:", allCookies.map((c) => c.name));

  // 1. Try known Supabase cookie names
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL
    ?.replace("https://", "")
    ?.split(".")[0];
  
  const candidates = [
    `sb-${projectRef}-auth-token`,
    "sb-access-token",
    "sb-refresh-token",
    "supabase-auth-token",
  ];

  for (const name of candidates) {
    const cookie = request.cookies.get(name);
    if (cookie?.value) {
      const userId = extractUserIdFromCookieValue(cookie.value);
      if (userId) {
        console.log("[Payslip API] Found user via:", name);
        return userId;
      }
    }
  }

  // 2. Fallback: scan ALL cookies for anything that looks like a JWT
  for (const cookie of allCookies) {
    if (cookie.value.includes(".") && cookie.value.length > 100) {
      const userId = extractUserIdFromCookieValue(cookie.value);
      if (userId) {
        console.log("[Payslip API] Found user via fallback scan:", cookie.name);
        return userId;
      }
    }
  }

  console.log("[Payslip API] No valid auth cookie found");
  return null;
}

export async function POST(request: NextRequest) {
  const { payrollRunId } = await request.json();
  if (!payrollRunId) {
    return NextResponse.json({ error: "Missing payrollRunId" }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY is not configured" }, { status: 500 });
  }

  const userId = getUserIdFromCookie(request);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  console.log("[Payslip API] Authenticated user:", userId);

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

  const batchPayload = validEntries.map((entry: any) => {
    const pdfBase64 = generatePayslipPdf(entry, tenant, run.pay_period);
    return {
      from: `${tenant?.name || "KaiWorkforce"} <payroll@kaimasala.com>`,
      to: entry.employee.profile.email,
      subject: `Your Payslip — ${run.pay_period?.start_date} to ${run.pay_period?.end_date}`,
      html: `<p>Hi ${entry.employee.profile.full_name},</p><p>Your payslip for this pay period is attached.</p><p>Net pay: <strong>$${Number(entry.net_pay).toFixed(2)}</strong></p><p>— ${tenant?.name || ""}</p>`,
      attachments: [
        {
          filename: `payslip-${run.pay_period?.start_date}.pdf`,
          content: pdfBase64,
        },
      ],
    };
  });

  const res = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(batchPayload),
  });

  const result = await res.json();

  if (!res.ok) {
    return NextResponse.json({ error: result?.message || "Failed to send payslips" }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    sent: validEntries.length,
    skipped,
  });
}