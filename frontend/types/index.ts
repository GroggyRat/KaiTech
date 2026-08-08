export type AppRole = 'admin' | 'manager' | 'employee' | 'agency_superadmin';

export interface Tenant {
  id: string;
  agency_id: string;
  plan_tier_id: string | null;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  timezone: string;
  currency: string;
  pay_period_frequency: 'weekly' | 'fortnightly' | 'monthly';
  seat_limit: number;
  seat_override: number | null;
  logo_url: string | null;
  accent_color: string;
  is_suspended: boolean;
  is_active: boolean;
  created_at: string;
}

export interface TenantFeature {
  id: string;
  tenant_id: string;
  feature_key: string;
  is_enabled: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  agency_id: string | null;
  is_agency_superadmin: boolean;
  is_active: boolean;
}

export interface UserTenantRole {
  id: string;
  user_id: string;
  tenant_id: string;
  role: AppRole;
  is_primary: boolean;
}

export interface Employee {
  id: string;
  tenant_id: string;
  profile_id: string;
  department_id: string | null;
  reports_to_id: string | null;
  employee_code: string | null;
  hourly_rate: number;
  yearly_rate: number;
  employment_type: 'full_time' | 'part_time' | 'contract';
  start_date: string;
  end_date: string | null;
  fnpf_number: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  is_active: boolean;
  profile?: Profile;
  department?: Department;
}

export interface Department {
  id: string;
  tenant_id: string;
  name: string;
}

export interface WorkSite {
  id: string;
  tenant_id: string;
  name: string;
  location: { lat: number; lng: number };
  radius_meters: number;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  status: 'pending' | 'active' | 'rejected' | 'archived';
  is_active: boolean;
}

export interface Shift {
  id: string;
  tenant_id: string;
  employee_id: string;
  work_site_id: string | null;
  clock_in_at: string;
  clock_in_location: { lat: number; lng: number } | null;
  clock_in_within_geofence: boolean | null;
  clock_out_at: string | null;
  clock_out_location: { lat: number; lng: number } | null;
  clock_out_within_geofence: boolean | null;
  total_hours: number | null;
  status: 'active' | 'completed' | 'flagged';
  employee?: Employee;
  work_site?: WorkSite;
}

export interface LocationPing {
  id: string;
  shift_id: string;
  location: { lat: number; lng: number };
  accuracy_meters: number | null;
  recorded_at: string;
}

export interface GeofenceViolation {
  id: string;
  tenant_id: string;
  shift_id: string;
  employee_id: string;
  work_site_id: string;
  violation_type: 'clock_in_outside' | 'left_during_shift';
  location: { lat: number; lng: number } | null;
  recorded_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  employee?: Employee;
}

export interface Timesheet {
  id: string;
  tenant_id: string;
  employee_id: string;
  pay_period_start: string;
  pay_period_end: string;
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  employee?: Employee;
}

export interface LeaveRequest {
  id: string;
  tenant_id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  employee?: Employee;
  leave_type?: LeaveType;
}

export interface LeaveType {
  id: string;
  tenant_id: string;
  name: string;
  default_days: number;
  is_paid: boolean;
}

export interface LeaveBalance {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  entitled_days: number;
  used_days: number;
  remaining_days: number;
  leave_type?: LeaveType;
}

export interface PayPeriod {
  id: string;
  tenant_id: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed';
}

export interface PayrollRun {
  id: string;
  tenant_id: string;
  pay_period_id: string;
  run_by: string;
  run_at: string;
  status: 'draft' | 'finalized' | 'paid';
  total_gross: number;
  total_net: number;
  notes: string | null;
  pay_period?: PayPeriod;
}

export interface PayrollEntry {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  timesheet_id: string | null;
  regular_hours: number;
  overtime_hours: number;
  hourly_rate: number;
  overtime_multiplier: number;
  gross_pay: number;
  fnpf_employee_contribution: number;
  fnpf_employer_contribution: number;
  paye_tax: number;
  allowances: number;
  deductions: number;
  net_pay: number;
  employee?: Employee;
}

export interface Payslip {
  id: string;
  tenant_id: string;
  payroll_entry_id: string;
  employee_id: string;
  pay_period_start: string;
  pay_period_end: string;
  pdf_url: string | null;
  generated_at: string;
}

export interface TaxRate {
  id: string;
  tenant_id: string;
  rate_type: 'fnpf_employee' | 'fnpf_employer' | 'paye';
  bracket_min: number | null;
  bracket_max: number | null;
  rate_percent: number;
  fixed_amount: number;
  effective_from: string;
  effective_to: string | null;
}

export interface ComplianceFile {
  id: string;
  tenant_id: string;
  payroll_run_id: string;
  file_type: 'bank_batch' | 'fnpf' | 'frcs_paye';
  file_name: string;
  file_url: string;
  generated_by: string;
  generated_at: string;
  period_start: string;
  period_end: string;
}

export interface Notification {
  id: string;
  tenant_id: string;
  user_id: string;
  event_key: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  tenant_id: string | null;
  agency_id: string | null;
  actor_id: string;
  actor_role: AppRole;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  is_impersonation: boolean;
  impersonated_tenant_id: string | null;
  created_at: string;
}

export interface EmployeeDocument {
  id: string;
  tenant_id: string;
  employee_id: string;
  document_type: 'contract' | 'id' | 'certification' | 'tax_form' | 'other';
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  expiry_date: string | null;
  uploaded_by: string;
  created_at: string;
  employee?: Employee;
}

export interface PlanTier {
  id: string;
  agency_id: string;
  name: string;
  seat_limit: number;
  per_seat_rate: number;
  description: string | null;
  is_active: boolean;
}

export interface TenantInvoice {
  id: string;
  tenant_id: string;
  period_start: string;
  period_end: string;
  seat_count: number;
  rate_per_seat: number;
  total_amount: number;
  status: 'pending' | 'paid' | 'overdue';
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface Agency {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
}
