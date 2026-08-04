"use client";

import { useEffect, useMemo, useState } from "react";
import { useTenant } from "@/lib/hooks/useTenant";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";
import { Network, AlertCircle } from "lucide-react";
import type { Employee } from "@/types";

type EmployeeNode = Employee & { children: EmployeeNode[] };

export default function OrgChartPage() {
  const { tenant, role } = useTenant();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const isAdmin = role === "admin";

  useEffect(() => {
    if (!tenant) return;
    loadEmployees();
  }, [tenant]);

  const loadEmployees = async () => {
    const { data } = await supabase
      .from("employees")
      .select("*, profile:profiles(*), department:departments(*)")
      .eq("tenant_id", tenant!.id)
      .eq("is_active", true)
      .order("start_date", { ascending: true });
    setEmployees(data || []);
    setIsLoading(false);
  };

  const handleReportsToChange = async (employeeId: string, newManagerId: string) => {
    setError(null);
    setSavingId(employeeId);

    const { error: updateError } = await supabase
      .from("employees")
      .update({ reports_to_id: newManagerId || null })
      .eq("id", employeeId);

    if (updateError) {
      setError(updateError.message);
    } else {
      await loadEmployees();
    }
    setSavingId(null);
  };

  const tree = useMemo(() => {
    const byId = new Map<string, EmployeeNode>(
      employees.map((e) => [e.id, { ...e, children: [] }])
    );
    const roots: EmployeeNode[] = [];

    for (const emp of byId.values()) {
      if (emp.reports_to_id && byId.has(emp.reports_to_id)) {
        byId.get(emp.reports_to_id)!.children.push(emp);
      } else {
        roots.push(emp);
      }
    }
    return roots;
  }, [employees]);

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="section-title">Organizational Chart</h1>
        <p className="text-sm text-[var(--foreground-muted)] mt-1">
          {isAdmin
            ? "Set who each employee reports to. This also controls what managers can see for their team."
            : "Your organization's reporting structure."}
        </p>
      </div>

      {error && (
        <div className="card p-3 text-sm bg-[var(--danger)]/10 text-[var(--danger)] flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-[var(--foreground-muted)]">Loading org chart...</div>
        ) : employees.length === 0 ? (
          <div className="empty-state py-16">
            <Network className="h-8 w-8 text-[var(--foreground-muted)] mb-3" />
            <p className="text-[var(--foreground-muted)]">No employees to chart yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto pb-4">
            <div className="flex flex-col items-start gap-6 min-w-max px-2 pt-2">
              {tree.map((node) => (
                <OrgNode
                  key={node.id}
                  node={node}
                  allEmployees={employees}
                  isAdmin={isAdmin}
                  savingId={savingId}
                  onReportsToChange={handleReportsToChange}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OrgNode({
  node,
  allEmployees,
  isAdmin,
  savingId,
  onReportsToChange,
  depth = 0,
}: {
  node: EmployeeNode;
  allEmployees: Employee[];
  isAdmin: boolean;
  savingId: string | null;
  onReportsToChange: (employeeId: string, newManagerId: string) => void;
  depth?: number;
}) {
  // Prevent selecting a manager that is this employee or one of their own descendants (cycle).
  const descendantIds = useMemo(() => {
    const ids = new Set<string>();
    const collect = (n: EmployeeNode) => {
      ids.add(n.id);
      n.children.forEach(collect);
    };
    collect(node);
    return ids;
  }, [node]);

  const eligibleManagers = allEmployees.filter((e) => !descendantIds.has(e.id));

  return (
    <div className="flex items-start gap-6">
      <div className="flex flex-col items-center gap-2 shrink-0 w-56">
        <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)] font-medium text-xs shrink-0">
              {getInitials(node.profile?.full_name || "U")}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{node.profile?.full_name || "Unnamed"}</p>
              <p className="text-xs text-[var(--foreground-muted)] truncate">
                {node.department?.name || "No department"}
              </p>
            </div>
          </div>
          {isAdmin && (
            <select
              value={node.reports_to_id || ""}
              disabled={savingId === node.id}
              onChange={(e) => onReportsToChange(node.id, e.target.value)}
              className="mt-2 w-full text-xs rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 disabled:opacity-50"
            >
              <option value="">No manager (top level)</option>
              {eligibleManagers.map((m) => (
                <option key={m.id} value={m.id}>
                  Reports to {m.profile?.full_name || "Unnamed"}
                </option>
              ))}
            </select>
          )}
        </div>

        {node.children.length > 0 && (
          <div className="w-px flex-1 bg-[var(--border)] min-h-[24px]" />
        )}
      </div>

      {node.children.length > 0 && (
        <div className="flex flex-col gap-6 pt-0 border-l border-[var(--border)] pl-6 -ml-3">
          {node.children.map((child) => (
            <OrgNode
              key={child.id}
              node={child}
              allEmployees={allEmployees}
              isAdmin={isAdmin}
              savingId={savingId}
              onReportsToChange={onReportsToChange}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
