import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "payroll@kaiworkforce.com";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { payrollRunId } = body;

    if (!payrollRunId) {
      return NextResponse.json({ error: "payrollRunId is required" }, { status: 400 });
    }

    // ── 1. Fetch payroll run with all related data ─────────────────────
    const { data: run, error: runError } = await supabase
      .from("payroll_runs")
      .select(`
        id,
        status,
        tenant_id,
        pay_periods!inner(start_date, end_date),
        tenants!inner(name, accent_color)
      `)
      .eq("id", payrollRunId)
      .single();

    if (runError || !run) {
      return NextResponse.json(
        { error: runError?.message || "Payroll run not found" },
        { status: 404 }
      );
    }

    // ── 2. Fetch payroll entries with employee + profile ───────────────
    const { data: entries, error: entriesError } = await supabase
      .from("payroll_entries")
      .select(`
        id,
        net_pay,
        gross_pay,
        regular_hours,
        overtime_hours,
        employee:employees!inner(
          id,
          profile:profiles!inner(email, full_name)
        )
      `)
      .eq("payroll_run_id", payrollRunId);

    if (entriesError) {
      return NextResponse.json({ error: entriesError.message }, { status: 500 });
    }

    if (!entries || entries.length === 0) {
      return NextResponse.json({ error: "No entries found for this run" }, { status: 404 });
    }

    // ── 3. Fetch payslip PDFs ─────────────────────────────────────────
    const { data: payslips } = await supabase
      .from("payslips")
      .select("payroll_entry_id, pdf_url")
      .in(
        "payroll_entry_id",
        entries.map((e: any) => e.id)
      );

    const payslipMap = new Map<string, string>();
    if (payslips) {
      for (const p of payslips) {
        if (p.pdf_url) payslipMap.set(p.payroll_entry_id, p.pdf_url);
      }
    }

    // ── 4. Build batch email payload ───────────────────────────────────
    // FIX: pay_periods and tenants are arrays from Supabase
    const payPeriod = Array.isArray(run.pay_periods) ? run.pay_periods[0] : run.pay_periods;
    const tenant = Array.isArray(run.tenants) ? run.tenants[0] : run.tenants;

    const periodStart = payPeriod?.start_date ?? "—";
    const periodEnd = payPeriod?.end_date ?? "—";
    const tenantName = tenant?.name || "KaiWorkforce";
    const accentColor = tenant?.accent_color || "#007AFF";

    const batchPayload: any[] = [];
    const skipped: string[] = [];

    for (const entry of entries as any[]) {
      const email = entry.employee?.profile?.email;
      const fullName = entry.employee?.profile?.full_name || "Employee";
      const pdfPath = payslipMap.get(entry.id);

      if (!email) {
        skipped.push(`Entry ${entry.id}: no email`);
        continue;
      }

      // Generate a signed URL for the PDF (valid for 7 days)
      let pdfUrl: string | null = null;
      if (pdfPath) {
        const { data: signedUrl } = await supabase.storage
          .from("documents")
          .createSignedUrl(pdfPath.replace(/^documents\//, ""), 60 * 60 * 24 * 7);
        pdfUrl = signedUrl?.signedUrl ?? null;
      }

      const netPay = Number(entry.net_pay || 0).toFixed(2);
      const grossPay = Number(entry.gross_pay || 0).toFixed(2);

      // ── HTML Email ─────────────────────────────────────────────────
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Your Payslip — ${tenantName}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" max-width="560" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="background:${accentColor};padding:32px 32px 24px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;letter-spacing:-0.3px;">${tenantName}</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Payslip Notification</p>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;color:#18181b;font-size:16px;line-height:1.5;">Hi ${fullName},</p>
              <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;line-height:1.5;">
                Your payslip for <strong style="color:#18181b;">${periodStart}</strong> to <strong style="color:#18181b;">${periodEnd}</strong> is now available.
              </p>
              
              <!-- Pay Summary Card -->
              <table role="presentation" width="100%" style="background:#fafafa;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 4px;color:#71717a;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Net Pay</p>
                    <p style="margin:0;color:#18181b;font-size:28px;font-weight:700;letter-spacing:-0.5px;">$${netPay}</p>
                    <p style="margin:8px 0 0;color:#a1a1aa;font-size:13px;">Gross: $${grossPay}</p>
                  </td>
                </tr>
              </table>

              ${pdfUrl ? `
              <!-- CTA -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:16px;">
                <tr>
                  <td style="border-radius:8px;background:${accentColor};text-align:center;">
                    <a href="${pdfUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:500;border-radius:8px;">Download Payslip PDF</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:1.4;">This secure link expires in 7 days. If it expires, contact your administrator.</p>
              ` : `
              <p style="margin:0 0 16px;color:#ef4444;font-size:14px;">⚠️ PDF link unavailable. Please contact your administrator.</p>
              `}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #f4f4f5;text-align:center;">
              <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:1.5;">— ${tenantName}<br/>This is an automated payroll notification.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      // ── Plain Text Fallback ────────────────────────────────────────
      const text = `Hi ${fullName},

Your payslip for ${periodStart} to ${periodEnd} is now available.

Net Pay: $${netPay}
Gross Pay: $${grossPay}

${pdfUrl ? `Download your payslip: ${pdfUrl}` : "PDF link unavailable. Contact your administrator."}

— ${tenantName}`;

      batchPayload.push({
        from: `${tenantName} Payroll <${RESEND_FROM_EMAIL}>`,
        to: email,
        subject: `Your Payslip — ${periodStart} to ${periodEnd}`,
        html,
        text,
        reply_to: RESEND_FROM_EMAIL,
      });
    }

    // ── 5. Send via Resend ───────────────────────────────────────────
    if (batchPayload.length === 0) {
      return NextResponse.json(
        { error: "No valid recipients found", skipped },
        { status: 400 }
      );
    }

    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batchPayload),
    });

    const responseText = await res.text();
    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { message: responseText.slice(0, 500) };
    }

    if (!res.ok) {
      console.error("Resend batch error:", result);
      return NextResponse.json(
        { error: result?.message || "Failed to send emails", details: result },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      sent: batchPayload.length,
      skipped,
      resendResponse: result,
    });
  } catch (err: any) {
    console.error("Send payslips error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}