export type Database = {
  public: {
    Tables: {
      agencies: { Row: any; Insert: any; Update: any };
      tenants: { Row: any; Insert: any; Update: any };
      profiles: { Row: any; Insert: any; Update: any };
      user_tenant_roles: { Row: any; Insert: any; Update: any };
      employees: { Row: any; Insert: any; Update: any };
      work_sites: { Row: any; Insert: any; Update: any };
      shifts: { Row: any; Insert: any; Update: any };
      location_pings: { Row: any; Insert: any; Update: any };
      geofence_violations: { Row: any; Insert: any; Update: any };
      timesheets: { Row: any; Insert: any; Update: any };
      timesheet_entries: { Row: any; Insert: any; Update: any };
      leave_types: { Row: any; Insert: any; Update: any };
      leave_balances: { Row: any; Insert: any; Update: any };
      leave_requests: { Row: any; Insert: any; Update: any };
      pay_periods: { Row: any; Insert: any; Update: any };
      tax_rates: { Row: any; Insert: any; Update: any };
      payroll_runs: { Row: any; Insert: any; Update: any };
      payroll_entries: { Row: any; Insert: any; Update: any };
      payslips: { Row: any; Insert: any; Update: any };
      compliance_files: { Row: any; Insert: any; Update: any };
      notifications: { Row: any; Insert: any; Update: any };
      audit_logs: { Row: any; Insert: any; Update: any };
      employee_documents: { Row: any; Insert: any; Update: any };
      plan_tiers: { Row: any; Insert: any; Update: any };
      tenant_invoices: { Row: any; Insert: any; Update: any };
      departments: { Row: any; Insert: any; Update: any };
      manager_employees: { Row: any; Insert: any; Update: any };
      employee_pay_rate_history: { Row: any; Insert: any; Update: any };
      pay_adjustments: { Row: any; Insert: any; Update: any };
      employee_pay_adjustments: { Row: any; Insert: any; Update: any };
      notification_events: { Row: any; Insert: any; Update: any };
      notification_settings: { Row: any; Insert: any; Update: any };
    };
    Functions: {
      get_user_tenant_role: { Args: { p_tenant_id: string }; Returns: string };
      is_tenant_admin: { Args: { p_tenant_id: string }; Returns: boolean };
      is_tenant_manager: { Args: { p_tenant_id: string }; Returns: boolean };
      is_agency_superadmin: { Args: Record<string, never>; Returns: boolean };
      get_managed_employee_ids: { Args: { p_tenant_id: string }; Returns: string[] };
    };
  };
};
