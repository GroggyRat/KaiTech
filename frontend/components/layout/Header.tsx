"use client";

import { useState } from "react";
import Link from "next/link";
import { useTenant } from "@/lib/hooks/useTenant";
import { useAuth } from "@/lib/hooks/useAuth";
import { useTheme } from "@/lib/hooks/useTheme";
import { usePathname } from "next/navigation";
import {
  Bell,
  Moon,
  Sun,
  Monitor,
  ChevronDown,
  Building2,
  Check,
  Menu,
  LogOut,
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
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";

const adminNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/employees/", label: "Employees", icon: Users },
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

export function Header() {
  const { tenant, role, switchTenant, roles } = useTenant();
  const { user, signOut } = useAuth();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [showTenantMenu, setShowTenantMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const pathname = usePathname();

  const tenantRoles = (roles || []).filter((r) => r.role !== "agency_superadmin");

  const navItems =
    role === "admin" ? adminNav : role === "manager" ? managerNav : employeeNav;

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-xl">
      <div className="flex items-center justify-between h-full px-4 lg:px-8">
        <div className="flex items-center gap-4">
          <button
            className="lg:hidden p-2 rounded-xl hover:bg-[var(--surface-elevated)]"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold hidden sm:block">
            {pathname === "/" ? "Dashboard" :
             pathname.includes("employees") ? "Employees" :
             pathname.includes("work-sites") ? "Work Sites" :
             pathname.includes("attendance") ? "Attendance" :
             pathname.includes("payroll") ? "Payroll" :
             pathname.includes("timesheets") ? "Timesheets" :
             pathname.includes("leave") ? "Leave" :
             pathname.includes("documents") ? "Documents" :
             pathname.includes("reports") ? "Reports" :
             pathname.includes("settings") ? "Settings" :
             pathname.includes("notifications") ? "Notifications" :
             pathname.includes("audit-log") ? "Audit Log" : "KaiWorkforce"}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/notifications/"
            className="relative p-2 rounded-xl hover:bg-[var(--surface-elevated)] transition-colors"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[var(--danger)]" />
          </Link>

          <div className="relative">
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="p-2 rounded-xl hover:bg-[var(--surface-elevated)] transition-colors"
            >
              {resolvedTheme === "dark" ? (
                <Moon className="h-5 w-5" />
              ) : (
                <Sun className="h-5 w-5" />
              )}
            </button>
            {showThemeMenu && (
              <div className="absolute right-0 mt-2 w-40 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xl py-1 animate-fade-in">
                {(["light", "dark", "system"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setTheme(t); setShowThemeMenu(false); }}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-[var(--surface-elevated)] capitalize"
                  >
                    {t === "light" && <Sun className="h-4 w-4" />}
                    {t === "dark" && <Moon className="h-4 w-4" />}
                    {t === "system" && <Monitor className="h-4 w-4" />}
                    {t}
                    {theme === t && <Check className="h-4 w-4 ml-auto text-[var(--accent)]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {tenantRoles.length > 1 && (
            <div className="relative">
              <button
                onClick={() => setShowTenantMenu(!showTenantMenu)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-[var(--surface-elevated)] transition-colors"
              >
                <Building2 className="h-4 w-4 text-[var(--foreground-muted)]" />
                <span className="text-sm font-medium hidden sm:block">{tenant?.name}</span>
                <ChevronDown className="h-4 w-4 text-[var(--foreground-muted)]" />
              </button>
              {showTenantMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-[var(--surface)] border border-[var(--border)] shadow-xl py-1 animate-fade-in">
                  {tenantRoles.map((tr) => (
                    <button
                      key={tr.tenant_id}
                      onClick={() => {
                        switchTenant(tr.tenant_id);
                        setShowTenantMenu(false);
                      }}
                      className={cn(
                        "flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-[var(--surface-elevated)]",
                        tenant?.id === tr.tenant_id && "bg-[var(--accent)]/10 text-[var(--accent)]"
                      )}
                    >
                      <span className="capitalize">{tr.role}</span>
                      <span className="text-[var(--foreground-muted)]">—</span>
                      <span className="truncate">{tr.tenant_id.slice(0, 8)}</span>
                      {tenant?.id === tr.tenant_id && <Check className="h-4 w-4 ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="h-8 w-8 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-xs font-medium">
            {getInitials(user?.full_name || user?.email || "U")}
          </div>
        </div>
      </div>

      {showMobileMenu && (
        <div className="lg:hidden fixed inset-0 top-16 z-50 bg-[var(--surface-overlay)]" onClick={() => setShowMobileMenu(false)}>
          <div className="absolute left-0 top-0 w-64 h-[calc(100vh-4rem)] bg-[var(--surface)] border-r border-[var(--border)] p-4">
            <nav className="space-y-0.5">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMobileMenu(false)}
                    className={cn("nav-item", isActive && "active")}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <button onClick={() => { signOut(); setShowMobileMenu(false); }} className="nav-item w-full text-left mt-4">
                <LogOut className="h-[18px] w-[18px] shrink-0" />
                <span>Sign Out</span>
              </button>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
