"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTenant } from "@/lib/hooks/useTenant";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  LayoutDashboard,
  Users,
  MapPin,
  Clock,
  CreditCard,
  FileText,
  CalendarDays,
  FolderOpen,
  BarChart3,
  Settings,
  Shield,
  LogOut,
  Building2,
  Network,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { featureForRoute } from "@/lib/features";

const adminNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/employees/", label: "Employees", icon: Users },
  { href: "/org-chart/", label: "Org Chart", icon: Network },
  { href: "/work-sites/", label: "Work Sites", icon: MapPin },
  { href: "/attendance/", label: "Attendance", icon: Clock },
  { href: "/payroll/", label: "Payroll", icon: CreditCard },
  { href: "/timesheets/", label: "Timesheets", icon: FileText },
  { href: "/leave/", label: "Leave", icon: CalendarDays },
  { href: "/documents/", label: "Documents", icon: FolderOpen },
  { href: "/reports/", label: "Reports", icon: BarChart3 },
  { href: "/settings/", label: "Settings", icon: Settings },
];

const managerNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/employees/", label: "My Team", icon: Users },
  { href: "/org-chart/", label: "Org Chart", icon: Network },
  { href: "/work-sites/", label: "Work Sites", icon: MapPin },
  { href: "/attendance/", label: "Attendance", icon: Clock },
  { href: "/timesheets/", label: "Timesheets", icon: FileText },
  { href: "/leave/", label: "Leave", icon: CalendarDays },
  { href: "/documents/", label: "Documents", icon: FolderOpen },
];

const employeeNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/attendance/", label: "Attendance", icon: Clock },
  { href: "/timesheets/", label: "My Timesheets", icon: FileText },
  { href: "/leave/", label: "Leave", icon: CalendarDays },
  { href: "/documents/", label: "My Documents", icon: FolderOpen },
];

export function Sidebar() {
  const pathname = usePathname();
  const { tenant, role, hasFeature } = useTenant();
  const { signOut, user } = useAuth();

  const baseNav =
    role === "admin" ? adminNav : role === "manager" ? managerNav : employeeNav;

  // Dashboard/Employees/Settings have no feature key (core, always on).
  // Everything else is hidden the moment its tenant feature is off.
  const navItems = baseNav.filter((item) => {
    const feature = featureForRoute(item.href);
    return !feature || hasFeature(feature.key);
  });

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen sticky top-0 border-r border-[var(--border)] bg-[var(--surface)]">
      <div className="p-6">
        <div className="flex items-center gap-3">
          {tenant?.logo_url ? (
            <img
              src={tenant.logo_url}
              alt={tenant.name}
              className="h-8 w-auto object-contain"
            />
          ) : (
            <div className="h-8 w-8 rounded-lg bg-[var(--accent)] flex items-center justify-center">
              <Building2 className="h-4 w-4 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{tenant?.name || "KaiWorkforce"}</p>
            <p className="text-xs text-[var(--foreground-muted)] capitalize">{role} View</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "nav-item",
                isActive && "active"
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[var(--border)]">
        {user?.is_agency_superadmin && (
          <Link
            href="/console/"
            className="nav-item mb-1"
          >
            <Shield className="h-[18px] w-[18px] shrink-0" />
            <span>Agency Console</span>
          </Link>
        )}
        <button onClick={signOut} className="nav-item w-full text-left">
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
