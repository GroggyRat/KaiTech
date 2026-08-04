"use client";

import { AuthProvider } from "@/lib/hooks/useAuth";
import { ThemeProvider } from "@/lib/hooks/useTheme";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Settings,
  LogOut,
  ArrowLeft,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";

const consoleNav = [
  { href: "/console/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/console/tenants/", label: "Tenants", icon: Building2 },
  { href: "/console/billing/", label: "Billing", icon: CreditCard },
  { href: "/console/plans/", label: "Plan Tiers", icon: Settings },
];

function ConsoleSidebar() {
  const pathname = usePathname();
  const { signOut, user } = useAuth();

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen sticky top-0 border-r border-[var(--border)] bg-[var(--surface)]">
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-[#FF6B35] flex items-center justify-center">
            <Building2 className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold">Agency Console</p>
            <p className="text-xs text-[var(--foreground-muted)]">Superadmin</p>
          </div>
        </div>
      </div>

      <div className="px-3 pb-3">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-[var(--foreground-muted)] hover:bg-[var(--surface-elevated)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tenant App
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {consoleNav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("nav-item", isActive && "active")}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-[var(--border)]">
        <button onClick={signOut} className="nav-item w-full text-left">
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

function ConsoleHeader() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-40 h-16 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-xl">
      <div className="flex items-center justify-end h-full px-4 lg:px-8">
        <div className="h-8 w-8 rounded-full bg-[#FF6B35] flex items-center justify-center text-white text-xs font-medium">
          {getInitials(user?.full_name || user?.email || "A")}
        </div>
      </div>
    </header>
  );
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <div className="flex min-h-screen">
          <ConsoleSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <ConsoleHeader />
            <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
              <div className="max-w-6xl mx-auto">
                {children}
              </div>
            </main>
          </div>
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
}
