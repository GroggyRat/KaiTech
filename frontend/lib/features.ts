// Single source of truth for the toggleable tenant modules.
//
// Dashboard, Employees, and Settings are core — every tenant gets
// them, so they aren't listed here and can't be turned off.
// Everything below can be enabled/disabled per tenant from
// /console/tenants, and is enforced both in the UI (nav + route
// guard) and at the database layer (see sql/002_tenant_features.sql).

export interface FeatureDefinition {
  key: string;
  label: string;
  description: string;
  /** Route prefixes under (tenant) that this feature gates. */
  routes: string[];
}

export const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  {
    key: "org_chart",
    label: "Org Chart",
    description: "Reporting-line hierarchy and manager reassignment.",
    routes: ["/org-chart/"],
  },
  {
    key: "work_sites",
    label: "Work Sites",
    description: "Geofenced site setup used to validate clock-ins.",
    routes: ["/work-sites/"],
  },
  {
    key: "attendance",
    label: "Attendance",
    description: "GPS clock in/out, live map, and location tracking.",
    routes: ["/attendance/"],
  },
  {
    key: "payroll",
    label: "Payroll",
    description: "PAYE/FNPF calculation, payroll runs, and compliance files.",
    routes: ["/payroll/"],
  },
  {
    key: "timesheets",
    label: "Timesheets",
    description: "Timesheet generation, approvals, and payslips.",
    routes: ["/timesheets/"],
  },
  {
    key: "leave",
    label: "Leave",
    description: "Leave requests, balances, and manager approvals.",
    routes: ["/leave/"],
  },
  {
    key: "documents",
    label: "Documents",
    description: "Employee document upload and download.",
    routes: ["/documents/"],
  },
  {
    key: "reports",
    label: "Reports",
    description: "Headcount, attendance, and payroll trend charts.",
    routes: ["/reports/"],
  },
  {
    key: "notifications",
    label: "Notifications",
    description: "In-app notification center and per-user preferences.",
    routes: ["/notifications/"],
  },
  {
    key: "audit_log",
    label: "Audit Log",
    description: "Tenant-visible history of sensitive actions.",
    routes: ["/audit-log/"],
  },
];

export type FeatureKey = (typeof FEATURE_DEFINITIONS)[number]["key"];

export const ALL_FEATURE_KEYS: string[] = FEATURE_DEFINITIONS.map((f) => f.key);

/** Looks up which feature (if any) gates a given (tenant) pathname. */
export function featureForRoute(pathname: string): FeatureDefinition | null {
  return (
    FEATURE_DEFINITIONS.find((f) => f.routes.some((r) => pathname.startsWith(r))) || null
  );
}
