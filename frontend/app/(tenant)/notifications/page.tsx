"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { Bell, Check, Trash2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { Notification } from "@/types";

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const supabase = createClient();

  useEffect(() => {
    if (!user) return;
    loadNotifications();
  }, [user]);

  const loadNotifications = async () => {
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setNotifications(data || []);
  };

  const markAsRead = async (id: string) => {
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id);
    loadNotifications();
  };

  const markAllAsRead = async () => {
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", user!.id)
      .eq("is_read", false);
    loadNotifications();
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <h1 className="section-title">Notifications</h1>
        {unreadCount > 0 && (
          <button onClick={markAllAsRead} className="btn-secondary text-xs">
            <Check className="h-3.5 w-3.5 mr-1.5" />
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="card empty-state py-16">
          <div className="empty-state-icon">
            <Bell className="h-6 w-6" />
          </div>
          <p className="text-[var(--foreground-muted)]">No notifications yet</p>
          <p className="text-xs text-[var(--foreground-muted)] mt-1">
            Alerts for leave, payroll, and geofence events appear here
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => !notif.is_read && markAsRead(notif.id)}
              className={`flex items-start gap-4 p-4 rounded-2xl cursor-pointer transition-colors ${
                notif.is_read
                  ? "opacity-60 hover:opacity-80"
                  : "bg-[var(--surface-elevated)] hover:bg-[var(--accent)]/5"
              }`}
            >
              <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${notif.is_read ? "bg-transparent" : "bg-[var(--accent)]"}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{notif.title}</p>
                <p className="text-sm text-[var(--foreground-muted)] mt-0.5">{notif.body}</p>
                <p className="text-xs text-[var(--foreground-muted)] mt-1.5">
                  {formatDateTime(notif.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
