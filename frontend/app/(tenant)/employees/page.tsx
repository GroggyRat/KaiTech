"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/lib/hooks/useTenant";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { Plus, Search, Pencil, Ban, ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency, formatDate, getInitials } from "@/lib/utils";
import type { Employee, Department } from "@/types";

type EmployeeWithRole = Employee & { tenant_role: "admin" | "manager" | "employee" };

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  employee: "Employee",
};

export default function EmployeesPage() {
  const { tenant, role } = useTenant();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EmployeeWithRole[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeWithRole | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (!tenant) return;
    loadData();
  }, [tenant]);

  const loadData = async () => {
    const { data: empData } = await supabase
      .from("employees")
      .select("*, profile:profiles(*), department:departments(*)")
      .eq("tenant_id", tenant!.id)
      .order("created_at", { ascending: false });

    const { data: deptData } = await supabase
      .from("departments")
      .select("*")
      .eq("tenant_id", tenant!.id);

    const { data: roleData } = await supabase
      .from("user_tenant_roles")
      .select("user_id, role")
      .eq("tenant_id", tenant!.id);

    const roleMap = new Map((roleData || []).map((r) => [r.user_id, r.role]));

    setEmployees(
      (empData || []).map((e) => ({ ...e, tenant_role: roleMap.get(e.profile_id) || "employee" }))
    );
    setDepartments(deptData || []);
    setIsLoading(false);
  };

  const filtered = employees.filter((e) => {
    const matchesSearch =
      (e.profile?.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.employee_code || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.profile?.email || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = showInactive ? true : e.is_active;
    return matchesSearch && matchesStatus;
  });

  const isAdmin = role === "admin";

  const handleRoleChange = async (emp: EmployeeWithRole, newRole: "admin" | "manager" | "employee") => {
    if (newRole === emp.tenant_role) return;
    setRoleError(null);

    if (emp.profile_id === user?.id && newRole !== "admin") {
      if (!confirm("This will remove your own admin access to this tenant. Continue?")) return;
    }

    setRoleUpdatingId(emp.id);
    const { error } = await supabase
      .from("user_tenant_roles")
      .update({ role: newRole })
      .eq("user_id", emp.profile_id)
      .eq("tenant_id", tenant!.id);

    if (error) {
      setRoleError(error.message);
    } else {
      await loadData();
    }
    setRoleUpdatingId(null);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="section-title">Employees</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={() => setShowDeptModal(true)} className="btn-secondary">
              Manage Departments
            </button>
            <button onClick={() => setShowAddModal(true)} className="btn-primary">
              <Plus className="h-4 w-4 mr-2" />
              Add Employee
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code, or email..."
            className="input pl-10"
          />
        </div>
        <button
          onClick={() => setShowInactive(!showInactive)}
          className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
            showInactive
              ? "bg-[var(--accent)] text-white border-[var(--accent)]"
              : "bg-[var(--surface)] text-[var(--foreground-muted)] border-[var(--border)] hover:text-[var(--foreground)]"
          }`}
        >
          {showInactive ? "Hide Inactive" : "Show Inactive"}
        </button>
      </div>

      <div className="card overflow-hidden p-0">
        {roleError && (
          <div className="p-3 text-sm bg-[var(--danger)]/10 text-[var(--danger)] border-b border-[var(--border)]">
            {roleError}
          </div>
        )}
        {isLoading ? (
          <div className="p-8 text-center text-[var(--foreground-muted)]">Loading employees...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state py-16">
            <p className="text-[var(--foreground-muted)]">
              {search ? "No employees match your search" : "No employees added yet"}
            </p>
            {isAdmin && !search && (
              <p className="text-xs text-[var(--foreground-muted)] mt-2">
                Click "Add Employee" to invite your first team member
              </p>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filtered.map((emp) => (
              <div
                key={emp.id}
                className={`flex items-center justify-between p-4 hover:bg-[var(--surface-elevated)]/50 transition-colors ${
                  !emp.is_active ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] font-medium text-sm shrink-0">
                    {getInitials(emp.profile?.full_name || "U")}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {emp.profile?.full_name || "Unnamed"}
                      {!emp.is_active && (
                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-[var(--foreground-muted)]/10 text-[var(--foreground-muted)] font-normal">
                          Inactive
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-[var(--foreground-muted)] truncate">
                      {emp.department?.name || "No department"} · {emp.employment_type.replace("_", " ")}
                    </p>
                    <p className="text-xs text-[var(--foreground-muted)]">{emp.profile?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-medium">{formatCurrency(emp.hourly_rate)}/hr</p>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      Started {formatDate(emp.start_date)}
                    </p>
                  </div>
                  {isAdmin ? (
                    <select
                      value={emp.tenant_role}
                      disabled={roleUpdatingId === emp.id}
                      onChange={(e) => handleRoleChange(emp, e.target.value as "admin" | "manager" | "employee")}
                      className="text-xs font-medium rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 disabled:opacity-50"
                    >
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="employee">Employee</option>
                    </select>
                  ) : (
                    <span className="text-xs font-medium px-2 py-1 rounded-lg bg-[var(--surface-elevated)] text-[var(--foreground-muted)]">
                      {ROLE_LABELS[emp.tenant_role]}
                    </span>
                  )}
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingEmployee(emp)}
                        className="p-2 rounded-lg hover:bg-[var(--surface-elevated)] transition-colors"
                      >
                        <Pencil className="h-4 w-4 text-[var(--foreground-muted)]" />
                      </button>
                      {emp.is_active && (
                        <button
                          onClick={async () => {
                            if (confirm(`Deactivate ${emp.profile?.full_name}? Their records will be preserved.`)) {
                              await supabase.from("employees").update({ is_active: false }).eq("id", emp.id);
                              loadData();
                            }
                          }}
                          className="p-2 rounded-lg hover:bg-[var(--surface-elevated)] transition-colors"
                        >
                          <Ban className="h-4 w-4 text-[var(--danger)]" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddEmployeeModal
          departments={departments}
          tenantId={tenant!.id}
          onClose={() => setShowAddModal(false)}
          onSuccess={loadData}
        />
      )}

      {editingEmployee && (
        <EditEmployeeModal
          employee={editingEmployee}
          departments={departments}
          onClose={() => setEditingEmployee(null)}
          onSuccess={loadData}
        />
      )}

      {showDeptModal && (
        <DepartmentsModal
          tenantId={tenant!.id}
          departments={departments}
          onClose={() => setShowDeptModal(false)}
          onChange={loadData}
        />
      )}
    </div>
  );
}

function AddEmployeeModal({
  departments,
  tenantId,
  onClose,
  onSuccess,
}: {
  departments: Department[];
  tenantId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    const form = e.currentTarget;
    const formData = new FormData(form);

    const email = formData.get("email") as string;
    const fullName = formData.get("full_name") as string;
    const hourlyRate = parseFloat(formData.get("hourly_rate") as string);
    const departmentId = formData.get("department_id") as string;
    const startDate = formData.get("start_date") as string;
    const selectedRole = (formData.get("role") as string) || "employee";
    const fnpfNumber = (formData.get("fnpf_number") as string) || null;
    const bankName = (formData.get("bank_name") as string) || null;
    const bankAccountNumber = (formData.get("bank_account_number") as string) || null;

    try {
      const res = await fetch("/api/employees/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          email,
          fullName,
          role: selectedRole,
          hourlyRate,
          departmentId: departmentId || null,
          startDate,
          fnpfNumber,
          bankName,
          bankAccountNumber,
        }),
      });

      let result: any = {};
      try {
        result = await res.json();
      } catch {
        // Response wasn't JSON (e.g. a 404/500 HTML error page) — fall through
        // to the generic error message below instead of leaving the button stuck.
      }

      if (!res.ok) {
        setError(result.error || `Request failed (${res.status}). Check that /api/employees/create exists.`);
      } else {
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || "Network error — could not reach the server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--surface-overlay)]">
      <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Add Employee</h2>
        {error && (
          <div className="mb-4 p-3 rounded-xl text-sm bg-[var(--danger)]/10 text-[var(--danger)]">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input name="full_name" className="input" placeholder="e.g., Maria Singh" required />
          </div>
          <div>
            <label className="label">Email</label>
            <input name="email" type="email" className="input" placeholder="maria@company.com" required />
          </div>
          <div>
            <label className="label">Role</label>
            <select name="role" className="input" defaultValue="employee">
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="label">Hourly Rate (FJD)</label>
            <input name="hourly_rate" type="number" step="0.01" min="0" className="input" placeholder="15.00" required />
          </div>
          <div>
            <label className="label">Department</label>
            <select name="department_id" className="input">
              <option value="">None</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Start Date</label>
            <input name="start_date" type="date" className="input" required />
          </div>
          <div>
            <label className="label">FNPF Number</label>
            <input name="fnpf_number" className="input" placeholder="e.g., 1234567" />
          </div>
          <div>
            <label className="label">Bank Name</label>
            <select name="bank_name" className="input" defaultValue="">
              <option value="">Select bank</option>
              <option value="Westpac">Westpac</option>
              <option value="ANZ">ANZ</option>
              <option value="BRED">BRED</option>
              <option value="BSP">BSP</option>
              <option value="HFC">HFC</option>
            </select>
          </div>
          <div>
            <label className="label">Bank Account Number</label>
            <input name="bank_account_number" className="input" placeholder="Account number" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
              {isSubmitting ? "Adding..." : "Add Employee"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditEmployeeModal({
  employee,
  departments,
  onClose,
  onSuccess,
}: {
  employee: EmployeeWithRole;
  departments: Department[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    const formData = new FormData(e.currentTarget);

    const fullName = formData.get("full_name") as string;
    const hourlyRate = parseFloat(formData.get("hourly_rate") as string);
    const departmentId = formData.get("department_id") as string;
    const employmentType = formData.get("employment_type") as string;
    const startDate = formData.get("start_date") as string;
    const fnpfNumber = (formData.get("fnpf_number") as string) || null;
    const bankName = (formData.get("bank_name") as string) || null;
    const bankAccountNumber = (formData.get("bank_account_number") as string) || null;

    try {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", employee.profile_id);

      if (profileError) throw profileError;

      const { error: empError } = await supabase
        .from("employees")
        .update({
          hourly_rate: hourlyRate,
          department_id: departmentId || null,
          employment_type: employmentType,
          start_date: startDate,
          fnpf_number: fnpfNumber,
          bank_name: bankName,
          bank_account_number: bankAccountNumber,
        })
        .eq("id", employee.id);

      if (empError) throw empError;

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to update employee");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--surface-overlay)]">
      <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Edit Employee</h2>
        {error && (
          <div className="mb-4 p-3 rounded-xl text-sm bg-[var(--danger)]/10 text-[var(--danger)]">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input name="full_name" className="input" defaultValue={employee.profile?.full_name} required />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input opacity-60" value={employee.profile?.email || ""} disabled />
            <p className="text-xs text-[var(--foreground-muted)] mt-1">
              Email can't be changed here.
            </p>
          </div>
          <div>
            <label className="label">Hourly Rate (FJD)</label>
            <input
              name="hourly_rate"
              type="number"
              step="0.01"
              min="0"
              className="input"
              defaultValue={employee.hourly_rate}
              required
            />
          </div>
          <div>
            <label className="label">Department</label>
            <select name="department_id" className="input" defaultValue={employee.department_id || ""}>
              <option value="">None</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Employment Type</label>
            <select name="employment_type" className="input" defaultValue={employee.employment_type}>
              <option value="full_time">Full time</option>
              <option value="part_time">Part time</option>
              <option value="contract">Contract</option>
            </select>
          </div>
          <div>
            <label className="label">Start Date</label>
            <input name="start_date" type="date" className="input" defaultValue={employee.start_date} required />
          </div>
          <div>
            <label className="label">FNPF Number</label>
            <input name="fnpf_number" className="input" defaultValue={employee.fnpf_number || ""} placeholder="e.g., 1234567" />
          </div>
          <div>
            <label className="label">Bank Name</label>
            <select name="bank_name" className="input" defaultValue={employee.bank_name || ""}>
              <option value="">Select bank</option>
              <option value="Westpac">Westpac</option>
              <option value="ANZ">ANZ</option>
              <option value="BRED">BRED</option>
              <option value="BSP">BSP</option>
              <option value="HFC">HFC</option>
            </select>
          </div>
          <div>
            <label className="label">Bank Account Number</label>
            <input
              name="bank_account_number"
              className="input"
              defaultValue={employee.bank_account_number || ""}
              placeholder="Account number"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn-primary flex-1">
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>

        <LeaveBalancesSection employeeId={employee.id} />
      </div>
    </div>
  );
}

function LeaveBalancesSection({ employeeId }: { employeeId: string }) {
  const [leaveTypes, setLeaveTypes] = useState<{ id: string; name: string }[]>([]);
  const [balances, setBalances] = useState<Record<string, { entitled_days: number; used_days: number; remaining_days: number }>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();
  const year = new Date().getFullYear();

  useEffect(() => {
    load();
  }, [employeeId]);

  const load = async () => {
    setIsLoading(true);
    const { data: tenantIdData } = await supabase.from("employees").select("tenant_id").eq("id", employeeId).single();

    const { data: typeData } = await supabase
      .from("leave_types")
      .select("id, name")
      .eq("tenant_id", tenantIdData?.tenant_id);

    const { data: balData } = await supabase
      .from("leave_balances")
      .select("leave_type_id, entitled_days, used_days, remaining_days")
      .eq("employee_id", employeeId)
      .eq("year", year);

    const balMap: typeof balances = {};
    (balData || []).forEach((b) => {
      balMap[b.leave_type_id] = b;
    });

    setLeaveTypes(typeData || []);
    setBalances(balMap);
    setIsLoading(false);
  };

  const handleReset = async (leaveTypeId: string) => {
    const value = parseFloat(inputs[leaveTypeId]);
    if (isNaN(value) || value < 0) {
      setError("Enter a valid number of days.");
      return;
    }
    setError("");
    setResettingId(leaveTypeId);

    const { error: rpcError } = await supabase.rpc("admin_reset_leave_balance", {
      p_employee_id: employeeId,
      p_leave_type_id: leaveTypeId,
      p_year: year,
      p_entitled_days: value,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setInputs((prev) => ({ ...prev, [leaveTypeId]: "" }));
      load();
    }
    setResettingId(null);
  };

  if (isLoading) return null;

  return (
    <div className="mt-6 pt-6 border-t border-[var(--border)]">
      <h3 className="text-sm font-semibold mb-1">Leave Balances ({year})</h3>
      <p className="text-xs text-[var(--foreground-muted)] mb-4">
        Setting a value resets used days to 0 and notifies the employee.
      </p>
      {error && (
        <div className="mb-3 p-2 rounded-lg text-xs bg-[var(--danger)]/10 text-[var(--danger)]">{error}</div>
      )}
      <div className="space-y-3">
        {leaveTypes.map((lt) => {
          const bal = balances[lt.id];
          return (
            <div key={lt.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{lt.name}</p>
                <p className="text-xs text-[var(--foreground-muted)]">
                  {bal
                    ? `${bal.remaining_days} left of ${bal.entitled_days} (${bal.used_days} used)`
                    : "Not set"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder={bal ? String(bal.entitled_days) : "days"}
                  value={inputs[lt.id] || ""}
                  onChange={(e) => setInputs((prev) => ({ ...prev, [lt.id]: e.target.value }))}
                  className="input w-20 text-sm py-1.5"
                />
                <button
                  onClick={() => handleReset(lt.id)}
                  disabled={resettingId === lt.id || !inputs[lt.id]}
                  className="btn-secondary text-xs py-1.5 px-2.5"
                >
                  {resettingId === lt.id ? "..." : "Reset"}
                </button>
              </div>
            </div>
          );
        })}
        {leaveTypes.length === 0 && (
          <p className="text-sm text-[var(--foreground-muted)]">No leave types configured for this tenant.</p>
        )}
      </div>
    </div>
  );
}

function DepartmentsModal({
  tenantId,
  departments,
  onClose,
  onChange,
}: {
  tenantId: string;
  departments: Department[];
  onClose: () => void;
  onChange: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsSaving(true);
    setError("");

    const { error: insertError } = await supabase
      .from("departments")
      .insert({ tenant_id: tenantId, name: newName.trim() });

    if (insertError) {
      setError(insertError.message);
    } else {
      setNewName("");
      onChange();
    }
    setIsSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this department? Employees in it will be set to no department.")) return;
    const { error: deleteError } = await supabase.from("departments").delete().eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      onChange();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--surface-overlay)]">
      <div className="w-full max-w-md rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Manage Departments</h2>
        {error && (
          <div className="mb-4 p-3 rounded-xl text-sm bg-[var(--danger)]/10 text-[var(--danger)]">{error}</div>
        )}

        <form onSubmit={handleAdd} className="flex gap-2 mb-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="input flex-1"
            placeholder="e.g., Operations"
          />
          <button type="submit" disabled={isSaving || !newName.trim()} className="btn-primary shrink-0">
            Add
          </button>
        </form>

        {departments.length === 0 ? (
          <p className="text-sm text-[var(--foreground-muted)]">No departments yet.</p>
        ) : (
          <div className="space-y-2">
            {departments.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--surface-elevated)]"
              >
                <span className="text-sm">{d.name}</span>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="text-xs text-[var(--danger)] hover:underline"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <button onClick={onClose} className="btn-secondary w-full mt-6">Close</button>
      </div>
    </div>
  );
}
