"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/lib/hooks/useTenant";
import { createClient } from "@/lib/supabase/client";
import { Shield, AlertTriangle } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { AuditLog } from "@/types";

export default function AuditLogPage() {
  const { tenant, role } = useTenant();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filter, setFilter] = useState("");
  const supabase = createClient();

  useEffect(() => {
    if (!tenant) return;
    loadLogs();
  }, [tenant]);

  const loadLogs = async () => {
    const { data } = await supabase
      .from("audit_logs")
      .select("*")
      .eq("tenant_id", tenant!.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setLogs(data || []);
  };

  const filtered = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(filter.toLowerCase()) ||
      l.entity_type.toLowerCase().includes(filter.toLowerCase())
  );

  if (role !== "admin") {
    return (
      <div className="empty-state py-16">
        <p className="text-[var(--foreground-muted)]">Audit logs are only available to administrators</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <h1 className="section-title">Audit Log</h1>
      </div>

      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by action or entity type..."
        className="input max-w-md"
      />

      <div className="card overflow-hidden p-0">
        {filtered.length === 0 ? (
          <div className="empty-state py-12">
            <Shield className="h-6 w-6 text-[var(--foreground-muted)] mb-3" />
            <p className="text-[var(--foreground-muted)]">No audit log entries</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {filtered.map((log) => (
              <div key={log.id} className="flex items-start gap-4 p-4 hover:bg-[var(--surface-elevated)]/50 transition-colors">
                <div className="mt-0.5">
                  {log.is_impersonation ? (
                    <AlertTriangle className="h-4 w-4 text-[var(--warning)]" />
                  ) : (
                    <Shield className="h-4 w-4 text-[var(--accent)]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{log.action}</span>
                    <span className="text-xs text-[var(--foreground-muted)]">on</span>
                    <span className="text-sm">{log.entity_type}</span>
                    {log.is_impersonation && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--warning)]/10 text-[var(--warning)]">
                        Impersonation
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--foreground-muted)] mt-1">
                    By {log.actor_id.slice(0, 8)} · {log.actor_role} · {formatDateTime(log.created_at)}
                  </p>
                  {(log.old_values || log.new_values) && (
                    <div className="mt-2 text-xs font-mono bg-[var(--surface-elevated)] rounded-lg p-2 overflow-x-auto">
                      {log.old_values && (
                        <span className="text-[var(--danger)]">-{JSON.stringify(log.old_values)}</span>
                      )}
                      {log.old_values && log.new_values && <span className="mx-2 text-[var(--foreground-muted)]">→</span>}
                      {log.new_values && (
                        <span className="text-[var(--success)]">+{JSON.stringify(log.new_values)}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
