# KaiWorkforce

Multi-tenant Payroll & HR platform for staffing agencies. Built for Fiji payroll compliance with configurable FNPF/PAYE rates.

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Backend/DB**: Supabase (PostgreSQL + PostGIS + Auth + Realtime)
- **Maps**: Leaflet + OpenStreetMap
- **Charts**: Recharts

## Quick Start

### 1. Supabase Setup

1. Create a new Supabase project
2. Enable PostGIS extension in Database > Extensions
3. Run the complete schema from `sql/schema.sql` in the SQL Editor
4. Create a Storage bucket named `documents` with public access disabled
5. Copy your Project URL and Anon Key from Settings > API

### 2. Environment Variables

Create `.env.local` in the `frontend` directory:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Install & Run

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Initial Setup

1. Sign up a user via Supabase Auth (or use the login page)
2. In Supabase SQL Editor, run:
   ```sql
   UPDATE profiles SET is_agency_superadmin = true WHERE email = 'your@email.com';
   ```
3. Visit `/console` to create your first tenant
4. Add employees through the tenant app

## Project Structure

```
frontend/
├── app/
│   ├── (tenant)/          # Tenant-facing app (admin/manager/employee)
│   │   ├── page.tsx        # Dashboard
│   │   ├── employees/
│   │   ├── work-sites/     # Geofence setup with Leaflet
│   │   ├── attendance/     # Clock in/out + live map
│   │   ├── payroll/        # Fiji PAYE/FNPF engine
│   │   ├── timesheets/
│   │   ├── leave/
│   │   ├── documents/
│   │   ├── reports/
│   │   ├── settings/       # Branding + notifications
│   │   ├── notifications/
│   │   └── audit-log/
│   ├── (agency)/console/  # Agency superadmin console (isolated route)
│   └── auth/login/
├── components/
│   └── layout/
│       ├── Sidebar.tsx      # Role-based navigation
│       └── Header.tsx       # Tenant switcher, theme, notifications
├── lib/
│   ├── utils.ts             # Fiji PAYE/FNPF calculations
│   ├── supabase/            # Client/server/middleware clients
│   └── hooks/               # useAuth, useTenant, useTheme
└── types/                   # TypeScript interfaces
```

## Architecture Decisions

### Multi-Tenancy
- Every table has `tenant_id`. RLS policies enforce strict isolation.
- Users can belong to multiple tenants with different roles via `user_tenant_roles`.

### Role Hierarchy
- **Employee**: Self-only access to attendance, timesheets, payslips, leave, documents
- **Manager**: Team-scoped access via `manager_employees`. Cannot view payroll or pay rates.
- **Admin**: Full operational control within one tenant.
- **Agency Superadmin**: Cross-tenant management via isolated `/console` route.

### Payroll Engine (Fiji)
- **FNPF**: Configurable via `tax_rates` table. Current default: 8% employee, 10% employer.
- **PAYE**: Bracket-based calculation per FRCS 2024-2025. Update `calculatePAYE()` in `lib/utils.ts` when brackets change.
- **Overtime**: Configurable multiplier per tenant (default 1.5x).

### Geofencing
- Work sites stored as PostGIS `geography(Point)` with radius.
- Clock-in validates GPS against assigned sites.
- Location pings every 60 seconds while clocked in (1-minute interval).
- Violations logged for admin/manager review.

### Compliance Files
- Placeholder CSVs for Bank Batch, FNPF, and FRCS PAYE submissions.
- Real institution-specific formats to be mapped once official specs are obtained.

## Security

- All data access enforced at database level via RLS (never frontend-only)
- Seat limits enforced by database trigger (hard block)
- Pay rate history logged automatically
- Audit log captures: payroll runs, role changes, billing changes, impersonation
- Impersonation flagged in UI and logged with `is_impersonation = true`

## PWA

The app includes a web app manifest for installability. Add service worker logic in `public/sw.js` for offline capabilities in v2.

## License

Proprietary — KaiWorkforce Agency Platform
"# KaiWorkforce" 
