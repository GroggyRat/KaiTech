import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const body = await request.json();
  const { payrollRunId, attachments } = body;

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
    .select("name")
    .eq("id", run.tenant_id)
    .single();

  const { data: entries } = await admin
    .from("payroll_entries")
    .select("*, employee:employees(profile:profiles(full_name, email))")
    .eq("payroll_run_id", payrollRunId);

  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: "No payroll entries found" }, { status: 404 });
  }

  const validEntries = entries.filter((e: any) => e.employee?.profile?.email);
  const skipped = entries.length - validEntries.length;

  // Attachments come from the client (pre-generated PDFs)
  const batchPayload = validEntries.map((entry: any, index: number) => {
    const pdfBase64 = attachments?.[index];
    
    const email: any = {
      from: `${tenant?.name || "KaiWorkforce"} <payroll@workforce.kaimasala.com>`,
      to: entry.employee.profile.email,
      subject: `Your Payslip — ${run.pay_period?.start_date} to ${run.pay_period?.end_date}`,
      html: `<p>Hi ${entry.employee.profile.full_name},</p><p>Your payslip for this pay period is attached.</p><p>Net pay: <strong>$${Number(entry.net_pay).toFixed(2)}</strong></p><p>— ${tenant?.name || "KaiWorkforce"}</p>`,
    };

    if (pdfBase64) {
      email.attachments = [{
        filename: `payslip-${entry.employee?.profile?.full_name?.replace(/\s/g, "_") || index}.pdf`,
        content: pdfBase64,
      }];
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
    return NextResponse.json({ error: result?.message || "Failed to send" }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    sent: validEntries.length,
    skipped,
    attachmentsIncluded: batchPayload.filter((e: any) => e.attachments).length,
  });
}