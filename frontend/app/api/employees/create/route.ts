import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function generateTempPassword(): string {
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const symbols = "!@#$%^&*()_+-=[]{}|;:,.?";
  const all = lower + upper + digits + symbols;
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];

  const required = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  const rest = Array.from({ length: 12 }, () => pick(all));
  const combined = [...required, ...rest];
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined.join("");
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { tenantId, email, fullName, role, hourlyRate, departmentId, startDate } = body;

  if (!tenantId || !email || !fullName || !role || hourlyRate === undefined || !startDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!["admin", "manager", "employee"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Verify the caller is actually signed in and is an admin for this tenant.
  // This uses the normal RLS-scoped client — nothing here bypasses auth.
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: callerRole } = await supabase
    .from("user_tenant_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .single();

  if (callerRole?.role !== "admin") {
    return NextResponse.json({ error: "Only tenant admins can add employees" }, { status: 403 });
  }

  // Enforce seat limit server-side too (defense in depth).
  const { count: currentCount } = await supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  const { data: tenantData } = await supabase
    .from("tenants")
    .select("seat_limit")
    .eq("id", tenantId)
    .single();

  if ((currentCount || 0) >= (tenantData?.seat_limit || 0)) {
    return NextResponse.json(
      { error: "Seat limit reached. Contact your agency to upgrade." },
      { status: 409 }
    );
  }

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();

  // Create the auth user directly — email_confirm: true skips the
  // confirmation email entirely, so there's nothing to rate-limit and
  // no "email not confirmed" step blocking the new employee's first login.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message || "Failed to create user" },
      { status: 400 }
    );
  }

  const newUserId = created.user.id;

  // Ensure profile exists (the handle_new_user trigger should cover this,
  // but upsert defensively in case it ever fails silently).
  await admin.from("profiles").upsert(
    { id: newUserId, email, full_name: fullName, is_active: true },
    { onConflict: "id" }
  );

  const { error: roleError } = await admin.from("user_tenant_roles").insert({
    user_id: newUserId,
    tenant_id: tenantId,
    role,
  });

  if (roleError) {
    return NextResponse.json({ error: roleError.message }, { status: 400 });
  }

  const { error: empError } = await admin.from("employees").insert({
    tenant_id: tenantId,
    profile_id: newUserId,
    department_id: departmentId || null,
    hourly_rate: hourlyRate,
    start_date: startDate,
  });

  if (empError) {
    return NextResponse.json({ error: empError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, userId: newUserId });
}
