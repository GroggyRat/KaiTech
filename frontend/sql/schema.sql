
-- ============================================================
-- KAIWORKFORCE — COMPLETE SUPABASE SCHEMA
-- Multi-tenant Payroll & HR Platform (Fiji)
-- ============================================================

-- --------------------------------------------------------------
-- EXTENSIONS
-- --------------------------------------------------------------
create extension if not exists "postgis";
create extension if not exists "uuid-ossp";

-- --------------------------------------------------------------
-- 1. AGENCY & TENANCY
-- --------------------------------------------------------------

create table agencies (
    id uuid primary key default uuid_generate_v4(),
    name text not null,
    contact_email text,
    contact_phone text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table plan_tiers (
    id uuid primary key default uuid_generate_v4(),
    agency_id uuid not null references agencies(id) on delete cascade,
    name text not null,
    seat_limit int not null,
    per_seat_rate decimal(10,2) not null,
    description text,
    is_active boolean default true,
    created_at timestamptz default now()
);

create table tenants (
    id uuid primary key default uuid_generate_v4(),
    agency_id uuid not null references agencies(id) on delete cascade,
    plan_tier_id uuid references plan_tiers(id),
    name text not null,
    contact_email text,
    contact_phone text,
    timezone text default 'Pacific/Fiji',
    currency text default 'FJD',
    pay_period_frequency text default 'fortnightly' check (pay_period_frequency in ('weekly', 'fortnightly', 'monthly')),
    seat_limit int not null default 20,
    seat_override decimal(10,2), -- custom per-seat rate override
    logo_url text,
    accent_color text default '#007AFF',
    is_suspended boolean default false,
    is_active boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table tenant_invoices (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    period_start date not null,
    period_end date not null,
    seat_count int not null,
    rate_per_seat decimal(10,2) not null,
    total_amount decimal(10,2) not null,
    status text default 'pending' check (status in ('pending', 'paid', 'overdue')),
    paid_at timestamptz,
    notes text,
    created_at timestamptz default now()
);

create table tenant_billing_history (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    event_type text not null check (event_type in ('seat_limit_changed', 'plan_changed', 'rate_changed', 'invoice_generated')),
    old_value jsonb,
    new_value jsonb,
    changed_by uuid references auth.users(id),
    created_at timestamptz default now()
);

-- --------------------------------------------------------------
-- 2. USERS, ROLES & PROFILES
-- --------------------------------------------------------------

create table profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    full_name text,
    phone text,
    avatar_url text,
    agency_id uuid references agencies(id), -- null for regular tenant users
    is_agency_superadmin boolean default false,
    is_active boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create type app_role as enum ('admin', 'manager', 'employee', 'agency_superadmin');

create table user_tenant_roles (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid not null references profiles(id) on delete cascade,
    tenant_id uuid not null references tenants(id) on delete cascade,
    role app_role not null,
    is_primary boolean default false, -- primary tenant for user
    created_at timestamptz default now(),
    unique(user_id, tenant_id)
);

-- Manager -> Employee assignments (team scope)
create table manager_employees (
    id uuid primary key default uuid_generate_v4(),
    manager_id uuid not null references profiles(id) on delete cascade,
    employee_id uuid not null references profiles(id) on delete cascade,
    tenant_id uuid not null references tenants(id) on delete cascade,
    created_at timestamptz default now(),
    unique(manager_id, employee_id, tenant_id)
);

create table departments (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    name text not null,
    created_at timestamptz default now()
);

-- --------------------------------------------------------------
-- 3. EMPLOYEES
-- --------------------------------------------------------------

create table employees (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    profile_id uuid not null unique references profiles(id) on delete cascade,
    department_id uuid references departments(id) on delete set null,
    employee_code text,
    hourly_rate decimal(10,2) not null,
    yearly_rate decimal(10,2) generated always as (hourly_rate * 2080) stored,
    employment_type text default 'full_time' check (employment_type in ('full_time', 'part_time', 'contract')),
    start_date date not null,
    end_date date,
    is_active boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table employee_pay_rate_history (
    id uuid primary key default uuid_generate_v4(),
    employee_id uuid not null references employees(id) on delete cascade,
    old_hourly_rate decimal(10,2),
    new_hourly_rate decimal(10,2) not null,
    changed_by uuid not null references auth.users(id),
    changed_at timestamptz default now()
);

create table employee_documents (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    employee_id uuid not null references employees(id) on delete cascade,
    document_type text not null check (document_type in ('contract', 'id', 'certification', 'tax_form', 'other')),
    file_name text not null,
    file_url text not null,
    file_size int,
    mime_type text,
    expiry_date date,
    uploaded_by uuid not null references auth.users(id),
    created_at timestamptz default now()
);

-- --------------------------------------------------------------
-- 4. WORK SITES & GEOFENCES
-- --------------------------------------------------------------

create table work_sites (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    name text not null,
    location geography(point, 4326) not null,
    radius_meters int not null default 100,
    created_by uuid not null references auth.users(id),
    approved_by uuid references auth.users(id),
    approved_at timestamptz,
    status text default 'active' check (status in ('pending', 'active', 'rejected', 'archived')),
    is_active boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table employee_work_site_assignments (
    id uuid primary key default uuid_generate_v4(),
    employee_id uuid not null references employees(id) on delete cascade,
    work_site_id uuid not null references work_sites(id) on delete cascade,
    assigned_at timestamptz default now(),
    assigned_by uuid not null references auth.users(id),
    unique(employee_id, work_site_id)
);

-- --------------------------------------------------------------
-- 5. ATTENDANCE & LOCATION
-- --------------------------------------------------------------

create table shifts (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    employee_id uuid not null references employees(id) on delete cascade,
    work_site_id uuid references work_sites(id) on delete set null,
    clock_in_at timestamptz not null,
    clock_in_location geography(point, 4326),
    clock_in_within_geofence boolean,
    clock_out_at timestamptz,
    clock_out_location geography(point, 4326),
    clock_out_within_geofence boolean,
    total_hours decimal(6,2) generated always as (
        extract(epoch from (clock_out_at - clock_in_at)) / 3600.0
    ) stored,
    status text default 'active' check (status in ('active', 'completed', 'flagged')),
    notes text,
    created_at timestamptz default now()
);

create table location_pings (
    id uuid primary key default uuid_generate_v4(),
    shift_id uuid not null references shifts(id) on delete cascade,
    location geography(point, 4326) not null,
    accuracy_meters decimal(8,2),
    recorded_at timestamptz default now()
);

create table geofence_violations (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    shift_id uuid not null references shifts(id) on delete cascade,
    employee_id uuid not null references employees(id) on delete cascade,
    work_site_id uuid not null references work_sites(id) on delete cascade,
    violation_type text not null check (violation_type in ('clock_in_outside', 'left_during_shift')),
    location geography(point, 4326),
    recorded_at timestamptz default now(),
    acknowledged_by uuid references auth.users(id),
    acknowledged_at timestamptz
);

-- --------------------------------------------------------------
-- 6. TIMESHEETS
-- --------------------------------------------------------------

create table timesheets (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    employee_id uuid not null references employees(id) on delete cascade,
    pay_period_start date not null,
    pay_period_end date not null,
    total_hours decimal(8,2) default 0,
    regular_hours decimal(8,2) default 0,
    overtime_hours decimal(8,2) default 0,
    status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
    approved_by uuid references auth.users(id),
    approved_at timestamptz,
    notes text,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique(employee_id, pay_period_start, pay_period_end)
);

create table timesheet_entries (
    id uuid primary key default uuid_generate_v4(),
    timesheet_id uuid not null references timesheets(id) on delete cascade,
    shift_id uuid references shifts(id) on delete set null,
    work_date date not null,
    hours decimal(4,2) not null,
    entry_type text default 'regular' check (entry_type in ('regular', 'overtime', 'leave')),
    notes text,
    created_at timestamptz default now()
);

-- --------------------------------------------------------------
-- 7. LEAVE
-- --------------------------------------------------------------

create table leave_types (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    name text not null,
    default_days int not null default 10,
    is_paid boolean default true,
    created_at timestamptz default now()
);

create table leave_balances (
    id uuid primary key default uuid_generate_v4(),
    employee_id uuid not null references employees(id) on delete cascade,
    leave_type_id uuid not null references leave_types(id) on delete cascade,
    year int not null,
    entitled_days decimal(5,2) not null default 0,
    used_days decimal(5,2) not null default 0,
    remaining_days decimal(5,2) generated always as (entitled_days - used_days) stored,
    unique(employee_id, leave_type_id, year)
);

create table leave_requests (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    employee_id uuid not null references employees(id) on delete cascade,
    leave_type_id uuid not null references leave_types(id),
    start_date date not null,
    end_date date not null,
    days_requested decimal(5,2) not null,
    reason text,
    status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
    reviewed_by uuid references auth.users(id),
    reviewed_at timestamptz,
    review_notes text,
    created_at timestamptz default now()
);

-- --------------------------------------------------------------
-- 8. PAYROLL (Fiji)
-- --------------------------------------------------------------

create table pay_periods (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    start_date date not null,
    end_date date not null,
    status text default 'open' check (status in ('open', 'closed')),
    created_at timestamptz default now(),
    unique(tenant_id, start_date, end_date)
);

create table tax_rates (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    rate_type text not null check (rate_type in ('fnpf_employee', 'fnpf_employer', 'paye')),
    bracket_min decimal(12,2),
    bracket_max decimal(12,2),
    rate_percent decimal(5,2) not null,
    fixed_amount decimal(12,2) default 0,
    effective_from date not null,
    effective_to date,
    created_at timestamptz default now()
);

create table payroll_runs (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    pay_period_id uuid not null references pay_periods(id),
    run_by uuid not null references auth.users(id),
    run_at timestamptz default now(),
    status text default 'draft' check (status in ('draft', 'finalized', 'paid')),
    total_gross decimal(12,2) default 0,
    total_net decimal(12,2) default 0,
    notes text,
    created_at timestamptz default now()
);

create table payroll_entries (
    id uuid primary key default uuid_generate_v4(),
    payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
    employee_id uuid not null references employees(id) on delete cascade,
    timesheet_id uuid references timesheets(id),
    regular_hours decimal(6,2) default 0,
    overtime_hours decimal(6,2) default 0,
    hourly_rate decimal(10,2) not null,
    overtime_multiplier decimal(3,2) default 1.5,
    gross_pay decimal(12,2) not null,
    fnpf_employee_contribution decimal(12,2) not null,
    fnpf_employer_contribution decimal(12,2) not null,
    paye_tax decimal(12,2) not null,
    allowances decimal(12,2) default 0,
    deductions decimal(12,2) default 0,
    net_pay decimal(12,2) not null,
    created_at timestamptz default now()
);

create table payslips (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    payroll_entry_id uuid not null unique references payroll_entries(id) on delete cascade,
    employee_id uuid not null references employees(id) on delete cascade,
    pay_period_start date not null,
    pay_period_end date not null,
    pdf_url text,
    generated_at timestamptz default now(),
    downloaded_at timestamptz
);

-- Allowances / Deductions config per tenant
create table pay_adjustments (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    name text not null,
    adjustment_type text not null check (adjustment_type in ('allowance', 'deduction')),
    is_recurring boolean default false,
    default_amount decimal(10,2),
    created_at timestamptz default now()
);

create table employee_pay_adjustments (
    id uuid primary key default uuid_generate_v4(),
    employee_id uuid not null references employees(id) on delete cascade,
    pay_adjustment_id uuid not null references pay_adjustments(id) on delete cascade,
    amount decimal(10,2) not null,
    effective_from date not null,
    effective_to date,
    created_at timestamptz default now()
);

-- --------------------------------------------------------------
-- 9. COMPLIANCE FILES
-- --------------------------------------------------------------

create table compliance_files (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
    file_type text not null check (file_type in ('bank_batch', 'fnpf', 'frcs_paye')),
    file_name text not null,
    file_url text not null,
    generated_by uuid not null references auth.users(id),
    generated_at timestamptz default now(),
    period_start date not null,
    period_end date not null
);

-- --------------------------------------------------------------
-- 10. NOTIFICATIONS
-- --------------------------------------------------------------

create table notification_events (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    event_key text not null,
    event_label text not null,
    description text,
    default_in_app boolean default true,
    default_email boolean default true,
    created_at timestamptz default now(),
    unique(tenant_id, event_key)
);

create table notification_settings (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    event_key text not null,
    in_app_enabled boolean default true,
    email_enabled boolean default true,
    unique(tenant_id, user_id, event_key)
);

create table notifications (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid not null references tenants(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    event_key text not null,
    title text not null,
    body text not null,
    data jsonb,
    is_read boolean default false,
    read_at timestamptz,
    created_at timestamptz default now()
);

-- --------------------------------------------------------------
-- 11. AUDIT LOG
-- --------------------------------------------------------------

create table audit_logs (
    id uuid primary key default uuid_generate_v4(),
    tenant_id uuid references tenants(id) on delete cascade,
    agency_id uuid references agencies(id),
    actor_id uuid not null references auth.users(id),
    actor_role app_role not null,
    action text not null,
    entity_type text not null,
    entity_id uuid,
    old_values jsonb,
    new_values jsonb,
    is_impersonation boolean default false,
    impersonated_tenant_id uuid references tenants(id),
    ip_address inet,
    user_agent text,
    created_at timestamptz default now()
);

-- --------------------------------------------------------------
-- INDEXES
-- --------------------------------------------------------------
create index idx_tenants_agency on tenants(agency_id);
create index idx_user_tenant_roles_user on user_tenant_roles(user_id);
create index idx_user_tenant_roles_tenant on user_tenant_roles(tenant_id);
create index idx_employees_tenant on employees(tenant_id);
create index idx_employees_profile on employees(profile_id);
create index idx_shifts_employee on shifts(employee_id);
create index idx_shifts_tenant on shifts(tenant_id);
create index idx_shifts_active on shifts(employee_id, clock_out_at) where clock_out_at is null;
create index idx_location_pings_shift on location_pings(shift_id);
create index idx_geofence_violations_tenant on geofence_violations(tenant_id);
create index idx_timesheets_employee on timesheets(employee_id);
create index idx_timesheets_period on timesheets(pay_period_start, pay_period_end);
create index idx_payroll_runs_period on payroll_runs(pay_period_id);
create index idx_payroll_entries_run on payroll_entries(payroll_run_id);
create index idx_leave_requests_employee on leave_requests(employee_id);
create index idx_notifications_user on notifications(user_id, is_read);
create index idx_audit_logs_tenant on audit_logs(tenant_id);
create index idx_audit_logs_created on audit_logs(created_at desc);
create index idx_work_sites_tenant on work_sites(tenant_id);
create index idx_work_sites_location on work_sites using gist(location);
create index idx_location_pings_location on location_pings using gist(location);

-- --------------------------------------------------------------
-- HELPER FUNCTIONS FOR RLS
-- --------------------------------------------------------------

create or replace function get_user_tenant_role(p_tenant_id uuid)
returns app_role as $$
declare
    v_role app_role;
begin
    select role into v_role
    from user_tenant_roles
    where user_id = auth.uid() and tenant_id = p_tenant_id;
    return v_role;
end;
$$ language plpgsql security definer;

create or replace function is_tenant_admin(p_tenant_id uuid)
returns boolean as $$
begin
    return exists (
        select 1 from user_tenant_roles
        where user_id = auth.uid()
        and tenant_id = p_tenant_id
        and role = 'admin'
    );
end;
$$ language plpgsql security definer;

create or replace function is_tenant_manager(p_tenant_id uuid)
returns boolean as $$
begin
    return exists (
        select 1 from user_tenant_roles
        where user_id = auth.uid()
        and tenant_id = p_tenant_id
        and role = 'manager'
    );
end;
$$ language plpgsql security definer;

create or replace function is_agency_superadmin()
returns boolean as $$
begin
    return exists (
        select 1 from profiles
        where id = auth.uid()
        and is_agency_superadmin = true
    );
end;
$$ language plpgsql security definer;

create or replace function get_managed_employee_ids(p_tenant_id uuid)
returns setof uuid as $$
begin
    return query
    select employee_id from manager_employees
    where manager_id = auth.uid() and tenant_id = p_tenant_id;
end;
$$ language plpgsql security definer;

create or replace function get_current_user_tenant_id()
returns uuid as $$
begin
    -- Returns the primary tenant for the current user from JWT claim or session
    -- In practice, the app passes tenant_id in the request context
    -- This is a fallback; RLS policies primarily use explicit tenant_id checks
    return null;
end;
$$ language plpgsql security definer;

-- --------------------------------------------------------------
-- Helper for leave balance manager policy
create or replace function get_managed_employee_ids_from_employee(p_employee_id uuid)
returns setof uuid as $$
declare
    v_tenant_id uuid;
begin
    select tenant_id into v_tenant_id from employees where id = p_employee_id;
    return query select get_managed_employee_ids(v_tenant_id);
end;
$$ language plpgsql security definer;


-- RLS POLICIES
-- --------------------------------------------------------------

alter table agencies enable row level security;
alter table plan_tiers enable row level security;
alter table tenants enable row level security;
alter table tenant_invoices enable row level security;
alter table profiles enable row level security;
alter table user_tenant_roles enable row level security;
alter table manager_employees enable row level security;
alter table departments enable row level security;
alter table employees enable row level security;
alter table employee_pay_rate_history enable row level security;
alter table employee_documents enable row level security;
alter table work_sites enable row level security;
alter table employee_work_site_assignments enable row level security;
alter table shifts enable row level security;
alter table location_pings enable row level security;
alter table geofence_violations enable row level security;
alter table timesheets enable row level security;
alter table timesheet_entries enable row level security;
alter table leave_types enable row level security;
alter table leave_balances enable row level security;
alter table leave_requests enable row level security;
alter table pay_periods enable row level security;
alter table tax_rates enable row level security;
alter table payroll_runs enable row level security;
alter table payroll_entries enable row level security;
alter table payslips enable row level security;
alter table pay_adjustments enable row level security;
alter table employee_pay_adjustments enable row level security;
alter table compliance_files enable row level security;
alter table notification_events enable row level security;
alter table notification_settings enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;

-- AGENCIES: superadmin only
-- (Regular tenant users should not see agency data)
create policy agencies_superadmin on agencies
    for all using (is_agency_superadmin());

-- PLAN TIERS: superadmin full access; tenant users read-only their agency's plans
create policy plan_tiers_superadmin on plan_tiers
    for all using (is_agency_superadmin());

create policy plan_tiers_tenant_read on plan_tiers
    for select using (
        exists (
            select 1 from tenants t
            where t.agency_id = plan_tiers.agency_id
            and t.id in (select tenant_id from user_tenant_roles where user_id = auth.uid())
        )
    );

-- TENANTS: superadmin all; tenant admin/manager/employee select their own tenant only
create policy tenants_superadmin on tenants
    for all using (is_agency_superadmin());

create policy tenants_member on tenants
    for select using (
        id in (select tenant_id from user_tenant_roles where user_id = auth.uid())
    );

-- TENANT INVOICES: superadmin all; tenant admin read-only their own
create policy tenant_invoices_superadmin on tenant_invoices
    for all using (
        is_agency_superadmin() or
        exists (select 1 from tenants t where t.id = tenant_invoices.tenant_id and is_tenant_admin(t.id))
    );

-- PROFILES: users can read/write own; admin can read employees in their tenant; manager can read their team
create policy profiles_self on profiles
    for all using (id = auth.uid());

create policy profiles_tenant_admin on profiles
    for select using (
        exists (
            select 1 from employees e
            join user_tenant_roles utr on utr.tenant_id = e.tenant_id
            where e.profile_id = profiles.id
            and utr.user_id = auth.uid()
            and utr.role = 'admin'
        )
    );

create policy profiles_tenant_manager on profiles
    for select using (
        exists (
            select 1 from manager_employees me
            join employees e on e.id = me.employee_id
            where e.profile_id = profiles.id
            and me.manager_id = auth.uid()
        )
    );

create policy profiles_agency_superadmin on profiles
    for all using (is_agency_superadmin());

-- USER TENANT ROLES: self can read; admin can manage their tenant; superadmin all
create policy user_tenant_roles_self on user_tenant_roles
    for select using (user_id = auth.uid());

create policy user_tenant_roles_admin on user_tenant_roles
    for all using (
        is_tenant_admin(tenant_id)
    );

create policy user_tenant_roles_superadmin on user_tenant_roles
    for all using (is_agency_superadmin());

-- MANAGER EMPLOYEES: admin full within tenant; manager read their assignments
create policy manager_employees_admin on manager_employees
    for all using (is_tenant_admin(tenant_id));

create policy manager_employees_manager on manager_employees
    for select using (manager_id = auth.uid());

-- DEPARTMENTS: tenant members read; admin write
create policy departments_tenant on departments
    for select using (
        exists (select 1 from user_tenant_roles where user_id = auth.uid() and tenant_id = departments.tenant_id)
    );

create policy departments_admin on departments
    for all using (is_tenant_admin(tenant_id));

-- EMPLOYEES: self read; admin all; manager read their team
create policy employees_self on employees
    for select using (
        profile_id = auth.uid()
    );

create policy employees_admin on employees
    for all using (is_tenant_admin(tenant_id));

create policy employees_manager on employees
    for select using (
        id in (select get_managed_employee_ids(tenant_id))
    );

create policy employees_superadmin on employees
    for all using (is_agency_superadmin());

-- EMPLOYEE PAY RATE HISTORY: admin only (strictly admin-only per spec)
create policy employee_pay_rate_history_admin on employee_pay_rate_history
    for all using (
        exists (
            select 1 from employees e
            join user_tenant_roles utr on utr.tenant_id = e.tenant_id
            where e.id = employee_pay_rate_history.employee_id
            and utr.user_id = auth.uid()
            and utr.role = 'admin'
        )
    );

-- EMPLOYEE DOCUMENTS: self + admin only (managers cannot see)
create policy employee_documents_self on employee_documents
    for select using (
        exists (select 1 from employees e where e.id = employee_documents.employee_id and e.profile_id = auth.uid())
    );

create policy employee_documents_admin on employee_documents
    for all using (is_tenant_admin(tenant_id));

-- WORK SITES: tenant members read active; admin full; manager can create (pending)
create policy work_sites_tenant_read on work_sites
    for select using (
        exists (select 1 from user_tenant_roles where user_id = auth.uid() and tenant_id = work_sites.tenant_id)
        and status = 'active'
    );

create policy work_sites_admin on work_sites
    for all using (is_tenant_admin(tenant_id));

create policy work_sites_manager_create on work_sites
    for insert with check (
        is_tenant_manager(tenant_id) and status = 'pending'
    );

create policy work_sites_manager_read_pending on work_sites
    for select using (
        is_tenant_manager(tenant_id) and created_by = auth.uid()
    );

-- EMPLOYEE WORK SITE ASSIGNMENTS: tenant members read; admin write
create policy employee_work_site_assignments_tenant on employee_work_site_assignments
    for select using (
        exists (
            select 1 from employees e
            join user_tenant_roles utr on utr.tenant_id = e.tenant_id
            where e.id = employee_work_site_assignments.employee_id
            and utr.user_id = auth.uid()
        )
    );

create policy employee_work_site_assignments_admin on employee_work_site_assignments
    for all using (
        exists (
            select 1 from employees e
            join user_tenant_roles utr on utr.tenant_id = e.tenant_id
            where e.id = employee_work_site_assignments.employee_id
            and utr.user_id = auth.uid()
            and utr.role = 'admin'
        )
    );

-- SHIFTS: self read own; admin all; manager read their team
create policy shifts_self on shifts
    for select using (
        exists (select 1 from employees e where e.id = shifts.employee_id and e.profile_id = auth.uid())
    );

create policy shifts_admin on shifts
    for all using (is_tenant_admin(tenant_id));

create policy shifts_manager on shifts
    for select using (
        employee_id in (select get_managed_employee_ids(tenant_id))
    );

-- LOCATION PINGS: same as shifts (self/admin/manager)
create policy location_pings_self on location_pings
    for select using (
        exists (
            select 1 from shifts s
            join employees e on e.id = s.employee_id
            where s.id = location_pings.shift_id and e.profile_id = auth.uid()
        )
    );

create policy location_pings_admin on location_pings
    for all using (
        exists (
            select 1 from shifts s
            join user_tenant_roles utr on utr.tenant_id = s.tenant_id
            where s.id = location_pings.shift_id
            and utr.user_id = auth.uid()
            and utr.role = 'admin'
        )
    );

create policy location_pings_manager on location_pings
    for select using (
        exists (
            select 1 from shifts s
            where s.id = location_pings.shift_id
            and s.employee_id in (select get_managed_employee_ids(s.tenant_id))
        )
    );

-- GEOFENCE VIOLATIONS: admin and manager only (employees don't see violations)
create policy geofence_violations_admin on geofence_violations
    for all using (is_tenant_admin(tenant_id));

create policy geofence_violations_manager on geofence_violations
    for select using (
        employee_id in (select get_managed_employee_ids(tenant_id))
    );

-- TIMESHEETS: self read; admin all; manager read their team
create policy timesheets_self on timesheets
    for select using (
        exists (select 1 from employees e where e.id = timesheets.employee_id and e.profile_id = auth.uid())
    );

create policy timesheets_admin on timesheets
    for all using (is_tenant_admin(tenant_id));

create policy timesheets_manager on timesheets
    for select using (
        employee_id in (select get_managed_employee_ids(tenant_id))
    );

-- TIMESHEET ENTRIES: same scope as timesheets
create policy timesheet_entries_tenant on timesheet_entries
    for select using (
        exists (
            select 1 from timesheets t
            join employees e on e.id = t.employee_id
            where t.id = timesheet_entries.timesheet_id
            and (
                e.profile_id = auth.uid()
                or is_tenant_admin(t.tenant_id)
                or t.employee_id in (select get_managed_employee_ids(t.tenant_id))
            )
        )
    );

create policy timesheet_entries_admin on timesheet_entries
    for all using (
        exists (
            select 1 from timesheets t
            join user_tenant_roles utr on utr.tenant_id = t.tenant_id
            where t.id = timesheet_entries.timesheet_id
            and utr.user_id = auth.uid()
            and utr.role = 'admin'
        )
    );

-- LEAVE TYPES: tenant members read; admin write
create policy leave_types_tenant on leave_types
    for select using (
        exists (select 1 from user_tenant_roles where user_id = auth.uid() and tenant_id = leave_types.tenant_id)
    );

create policy leave_types_admin on leave_types
    for all using (is_tenant_admin(tenant_id));

-- LEAVE BALANCES: self read; admin all; manager read team
create policy leave_balances_self on leave_balances
    for select using (
        exists (select 1 from employees e where e.id = leave_balances.employee_id and e.profile_id = auth.uid())
    );

create policy leave_balances_admin on leave_balances
    for all using (
        exists (
            select 1 from employees e
            join user_tenant_roles utr on utr.tenant_id = e.tenant_id
            where e.id = leave_balances.employee_id
            and utr.user_id = auth.uid()
            and utr.role = 'admin'
        )
    );

create policy leave_balances_manager on leave_balances
    for select using (
        employee_id in (select get_managed_employee_ids_from_employee(leave_balances.employee_id))
    );

-- LEAVE REQUESTS: self read/write own; admin all; manager read/review team
create policy leave_requests_self on leave_requests
    for all using (
        exists (select 1 from employees e where e.id = leave_requests.employee_id and e.profile_id = auth.uid())
    );

create policy leave_requests_admin on leave_requests
    for all using (is_tenant_admin(tenant_id));

create policy leave_requests_manager on leave_requests
    for select using (
        employee_id in (select get_managed_employee_ids(tenant_id))
    );

create policy leave_requests_manager_review on leave_requests
    for update using (
        employee_id in (select get_managed_employee_ids(tenant_id))
    ) with check (
        employee_id in (select get_managed_employee_ids(tenant_id))
    );

-- PAY PERIODS: tenant members read; admin write
create policy pay_periods_tenant on pay_periods
    for select using (
        exists (select 1 from user_tenant_roles where user_id = auth.uid() and tenant_id = pay_periods.tenant_id)
    );

create policy pay_periods_admin on pay_periods
    for all using (is_tenant_admin(tenant_id));

-- TAX RATES: tenant members read; admin write
create policy tax_rates_tenant on tax_rates
    for select using (
        exists (select 1 from user_tenant_roles where user_id = auth.uid() and tenant_id = tax_rates.tenant_id)
    );

create policy tax_rates_admin on tax_rates
    for all using (is_tenant_admin(tenant_id));

-- PAYROLL RUNS: admin only (managers and employees have zero payroll visibility)
create policy payroll_runs_admin on payroll_runs
    for all using (is_tenant_admin(tenant_id));

-- PAYROLL ENTRIES: admin only
create policy payroll_entries_admin on payroll_entries
    for all using (
        exists (
            select 1 from payroll_runs pr
            join user_tenant_roles utr on utr.tenant_id = pr.tenant_id
            where pr.id = payroll_entries.payroll_run_id
            and utr.user_id = auth.uid()
            and utr.role = 'admin'
        )
    );

-- PAYSLIPS: self + admin only (managers excluded per spec)
create policy payslips_self on payslips
    for select using (
        exists (select 1 from employees e where e.id = payslips.employee_id and e.profile_id = auth.uid())
    );

create policy payslips_admin on payslips
    for all using (is_tenant_admin(tenant_id));

-- PAY ADJUSTMENTS: admin only
create policy pay_adjustments_admin on pay_adjustments
    for all using (is_tenant_admin(tenant_id));

create policy employee_pay_adjustments_admin on employee_pay_adjustments
    for all using (
        exists (
            select 1 from employees e
            join user_tenant_roles utr on utr.tenant_id = e.tenant_id
            where e.id = employee_pay_adjustments.employee_id
            and utr.user_id = auth.uid()
            and utr.role = 'admin'
        )
    );

-- COMPLIANCE FILES: admin only
create policy compliance_files_admin on compliance_files
    for all using (is_tenant_admin(tenant_id));

-- NOTIFICATION EVENTS: tenant members read; admin write
create policy notification_events_tenant on notification_events
    for select using (
        exists (select 1 from user_tenant_roles where user_id = auth.uid() and tenant_id = notification_events.tenant_id)
    );

create policy notification_events_admin on notification_events
    for all using (is_tenant_admin(tenant_id));

-- NOTIFICATION SETTINGS: self
create policy notification_settings_self on notification_settings
    for all using (user_id = auth.uid());

-- NOTIFICATIONS: self only
create policy notifications_self on notifications
    for all using (user_id = auth.uid());

-- AUDIT LOGS: admin read own tenant; superadmin read all
create policy audit_logs_admin on audit_logs
    for select using (
        is_tenant_admin(tenant_id)
    );

create policy audit_logs_superadmin on audit_logs
    for all using (is_agency_superadmin());

-- --------------------------------------------------------------
-- TRIGGERS
-- --------------------------------------------------------------

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger agencies_updated_at before update on agencies
    for each row execute function update_updated_at();
create trigger tenants_updated_at before update on tenants
    for each row execute function update_updated_at();
create trigger profiles_updated_at before update on profiles
    for each row execute function update_updated_at();
create trigger employees_updated_at before update on employees
    for each row execute function update_updated_at();
create trigger work_sites_updated_at before update on work_sites
    for each row execute function update_updated_at();
create trigger timesheets_updated_at before update on timesheets
    for each row execute function update_updated_at();

-- Auto-create profile on auth.user creation
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (id, email, full_name)
    values (new.id, new.email, new.raw_user_meta_data->>'full_name');
    return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Auto-create timesheet entries when shift is completed
create or replace function handle_shift_completion()
returns trigger as $$
begin
    if new.clock_out_at is not null and old.clock_out_at is null then
        -- Find or create timesheet for the pay period
        -- (Simplified: assumes pay period exists)
        null;
    end if;
    return new;
end;
$$ language plpgsql;

-- Seat limit enforcement trigger
create or replace function check_seat_limit()
returns trigger as $$
declare
    current_count int;
    max_seats int;
begin
    select count(*) into current_count
    from employees
    where tenant_id = new.tenant_id and is_active = true;

    select seat_limit into max_seats
    from tenants where id = new.tenant_id;

    if current_count >= max_seats then
        raise exception 'Seat limit reached for tenant. Contact agency to upgrade.';
    end if;

    return new;
end;
$$ language plpgsql;

create trigger enforce_seat_limit before insert on employees
    for each row execute function check_seat_limit();

-- Pay rate history logging
create or replace function log_pay_rate_change()
returns trigger as $$
begin
    if new.hourly_rate <> old.hourly_rate then
        insert into employee_pay_rate_history (employee_id, old_hourly_rate, new_hourly_rate, changed_by)
        values (new.id, old.hourly_rate, new.hourly_rate, auth.uid());
    end if;
    return new;
end;
$$ language plpgsql;

create trigger log_pay_rate_change before update on employees
    for each row execute function log_pay_rate_change();

-- Audit log helper
create or replace function log_audit(
    p_tenant_id uuid,
    p_action text,
    p_entity_type text,
    p_entity_id uuid,
    p_old_values jsonb,
    p_new_values jsonb,
    p_is_impersonation boolean default false,
    p_impersonated_tenant_id uuid default null
)
returns void as $$
declare
    v_role app_role;
    v_agency_id uuid;
begin
    select role into v_role from user_tenant_roles
    where user_id = auth.uid() and tenant_id = p_tenant_id;

    if v_role is null and is_agency_superadmin() then
        v_role := 'agency_superadmin'::app_role;
    end if;

    select agency_id into v_agency_id from tenants where id = p_tenant_id;

    insert into audit_logs (
        tenant_id, agency_id, actor_id, actor_role, action,
        entity_type, entity_id, old_values, new_values,
        is_impersonation, impersonated_tenant_id
    ) values (
        p_tenant_id, v_agency_id, auth.uid(), v_role, p_action,
        p_entity_type, p_entity_id, p_old_values, p_new_values,
        p_is_impersonation, p_impersonated_tenant_id
    );
end;
$$ language plpgsql security definer;

-- Default notification events seed trigger
create or replace function seed_notification_events()
returns trigger as $$
begin
    insert into notification_events (tenant_id, event_key, event_label, description)
    values
        (new.id, 'geofence_breach', 'Geofence Breach', 'Employee clocks in or leaves geofenced area'),
        (new.id, 'leave_submitted', 'Leave Request Submitted', 'An employee submits a leave request'),
        (new.id, 'leave_approved', 'Leave Request Approved', 'A leave request is approved or rejected'),
        (new.id, 'payroll_completed', 'Payroll Run Completed', 'A payroll run is finalized'),
        (new.id, 'document_expiring', 'Document Expiring', 'An employee document is nearing expiry'),
        (new.id, 'new_employee', 'New Employee Added', 'A new employee is added to the tenant'),
        (new.id, 'seat_limit_warning', 'Seat Limit Warning', 'Tenant is approaching seat limit');
    return new;
end;
$$ language plpgsql;

create trigger seed_tenant_notification_events after insert on tenants
    for each row execute function seed_notification_events();

-- --------------------------------------------------------------
-- DEFAULT DATA
-- --------------------------------------------------------------

-- Insert a default agency (to be configured)
insert into agencies (id, name, contact_email)
values ('00000000-0000-0000-0000-000000000001', 'KaiWorkforce Agency', 'admin@kaiworkforce.com')
on conflict do nothing;

-- Insert default plan tiers
insert into plan_tiers (agency_id, name, seat_limit, per_seat_rate, description)
values
    ('00000000-0000-0000-0000-000000000001', 'Starter', 20, 15.00, 'Up to 20 employees'),
    ('00000000-0000-0000-0000-000000000001', 'Growth', 100, 12.00, 'Up to 100 employees'),
    ('00000000-0000-0000-0000-000000000001', 'Enterprise', 500, 10.00, 'Up to 500 employees')
on conflict do nothing;
