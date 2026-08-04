"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/lib/hooks/useTenant";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { Plus, Check, X, CalendarDays, AlertCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { LeaveRequest, LeaveType, LeaveBalance } from "@/types";

export default function LeavePage() {
  const { tenant, role } = useTenant();
  const { user } = useAuth();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState("");
  const supabase = createClient();

  useEffect(() => {
    if (!tenant) return;
    loadData();
  }, [tenant]);

  const loadData = async () => {
    const { data: reqData } = await supabase
      .from("leave_requests")
      .select("*, employee:employees(profile:profiles(full_name)), leave_type:leave_types(*)")
      .eq("tenant_id", tenant!.id)
      .order("created_at", { ascending: false });

    const { data: typeData } = await supabase
      .from("leave_types")
      .select("*")
      .eq("tenant_id", tenant!.id);

    setRequests(reqData || []);
    setLeaveTypes(typeData || []);

    if (user) {
      const { data: empData } = await supabase
        .from("employees")
        .select("id")
        .eq("profile_id", user.id)
        .single();

      if (empData) {
        const { data: balData } = await supabase
          .from("leave_balances")
          .select("*, leave_type:leave_types(*)")
          .eq("employee_id", empData.id)
          .eq("year", new Date().getFullYear());
        setBalances(balData || []);
      }
    }

    setIsLoading(false);
  };

  const handleRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setRequestError("");
    const form = new FormData(e.currentTarget);

    const leaveTypeId = form.get("leave_type_id") as string;
    const daysRequested = parseFloat(form.get("days_requested") as string);

    const balance = balances.find((b) => b.leave_type_id === leaveTypeId);
    const remaining = balance ? balance.remaining_days : 0;

    if (remaining <= 0) {
      setRequestError("You have no remaining balance for this leave type.");
      return;
    }
    if (daysRequested > remaining) {
      setRequestError(`You only have ${remaining} day${remaining === 1 ? "" : "s"} remaining for this leave type.`);
      return;
    }

    const { data: empData } = await supabase
      .from("employees")
      .select("id")
      .eq("profile_id", user!.id)
      .single();

    if (!empData) {
      setRequestError("Employee record not found");
      return;
    }

    const { error } = await supabase.from("leave_requests").insert({
      tenant_id: tenant!.id,
      employee_id: empData.id,
      leave_type_id: leaveTypeId,
      start_date: form.get("start_date") as string,
      end_date: form.get("end_date") as string,
      days_requested: daysRequested,
      reason: form.get("reason") as string,
    });

    if (error) {
      setRequestError(error.message);
      return;
    }

    setShowRequestModal(false);
    loadData();
  };

  const handleReview = async (id: string, status: "approved" | "rejected", notes?: string) => {
    await supabase
      .from("leave_requests")
      .update({ status, review_notes: notes || null })
      .eq("id", id);
    loadData();
  };

  const isEmployee = role === "employee";
  const isAdminOrManager = role === "admin" || role === "manager";

  const myRequests = requests.filter((r) => r.employee_id === "self"); // RLS handles actual filtering
  const pendingRequests = requests.filter((r) => r.status === "pending");

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="section-title">Leave</h1>
        {isEmployee && (
          <button onClick={() => setShowRequestModal(true)} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" />
            Request Leave
          </button>
        )}
      </div>

      {isEmployee && balances.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {balances.map((bal) => (
            <div key={bal.id} className="card">
              <p className="text-sm text-[var(--foreground-muted)]">{bal.leave_type?.name}</p>
              <p className="text-2xl font-semibold mt-1">
                {bal.remaining_days}
                <span className="text-sm font-normal text-[var(--foreground-muted)] ml-1">days left</span>
              </p>
              <p className="text-xs text-[var(--foreground-muted)] mt-1">
                {bal.used_days} used of {bal.entitled_days} entitled
              </p>
            </div>
          ))}
        </div>
      )}

      {isAdminOrManager && pendingRequests.length > 0 && (
        <div className="card border-l-4 border-l-[var(--warning)]">
          <h2 className="text-lg font-semibold mb-4">Pending Requests ({pendingRequests.length})</h2>
          <div className="space-y-2">
            {pendingRequests.map((req) => (
              <LeaveRequestRow
                key={req.id}
                request={req}
                showActions
                onApprove={() => handleReview(req.id, "approved")}
                onReject={() => handleReview(req.id, "rejected")}
              />
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">
          {isEmployee ? "My Leave History" : "All Leave Requests"}
        </h2>
        {isLoading ? (
          <div className="py-8 text-center text-[var(--foreground-muted)]">Loading...</div>
        ) : requests.length === 0 ? (
          <div className="empty-state py-12">
            <CalendarDays className="h-8 w-8 text-[var(--foreground-muted)] mb-3" />
            <p className="text-[var(--foreground-muted)]">No leave requests</p>
            {isEmployee && (
              <p className="text-xs text-[var(--foreground-muted)] mt-1">Submit your first leave request to get started</p>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {requests.map((req) => (
              <LeaveRequestRow key={req.id} request={req} />
            ))}
          </div>
        )}
      </div>

      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--surface-overlay)]">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 animate-slide-up">
            <h2 className="text-lg font-semibold mb-4">Request Leave</h2>
            {requestError && (
              <div className="mb-4 p-3 rounded-xl text-sm bg-[var(--danger)]/10 text-[var(--danger)]">{requestError}</div>
            )}
            <form onSubmit={handleRequest} className="space-y-4">
              <div>
                <label className="label">Leave Type</label>
                <select name="leave_type_id" className="input" required defaultValue="">
                  <option value="" disabled>Select leave type</option>
                  {leaveTypes.map((lt) => {
                    const bal = balances.find((b) => b.leave_type_id === lt.id);
                    const remaining = bal ? bal.remaining_days : 0;
                    return (
                      <option key={lt.id} value={lt.id} disabled={remaining <= 0}>
                        {lt.name} ({remaining} day{remaining === 1 ? "" : "s"} left{remaining <= 0 ? " — none set by admin yet" : ""})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start Date</label>
                  <input name="start_date" type="date" className="input" required />
                </div>
                <div>
                  <label className="label">End Date</label>
                  <input name="end_date" type="date" className="input" required />
                </div>
              </div>
              <div>
                <label className="label">Days Requested</label>
                <input name="days_requested" type="number" step="0.5" min="0.5" className="input" required />
              </div>
              <div>
                <label className="label">Reason (optional)</label>
                <textarea name="reason" className="input" rows={3} placeholder="Brief reason for leave..." />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowRequestModal(false); setRequestError(""); }}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">Submit Request</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function LeaveRequestRow({
  request,
  showActions,
  onApprove,
  onReject,
}: {
  request: LeaveRequest;
  showActions?: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface-elevated)]">
      <div className="min-w-0">
        <p className="font-medium text-sm">{(request.employee as any)?.profile?.full_name || "You"}</p>
        <p className="text-xs text-[var(--foreground-muted)]">
          {request.leave_type?.name} · {formatDate(request.start_date)} – {formatDate(request.end_date)} · {request.days_requested} days
        </p>
        {request.reason && (
          <p className="text-xs text-[var(--foreground-muted)] mt-0.5 truncate">{request.reason}</p>
        )}
        {request.review_notes && (
          <p className="text-xs text-[var(--foreground-muted)] mt-0.5">Note: {request.review_notes}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${
            request.status === "approved"
              ? "bg-[var(--success)]/10 text-[var(--success)]"
              : request.status === "rejected"
              ? "bg-[var(--danger)]/10 text-[var(--danger)]"
              : "bg-[var(--warning)]/10 text-[var(--warning)]"
          }`}
        >
          {request.status}
        </span>
        {showActions && (
          <>
            <button
              onClick={onApprove}
              className="p-1.5 rounded-lg bg-[var(--success)]/10 text-[var(--success)] hover:bg-[var(--success)]/20 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onReject}
              className="p-1.5 rounded-lg bg-[var(--danger)]/10 text-[var(--danger)] hover:bg-[var(--danger)]/20 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
