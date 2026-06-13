# Fixly Admin Panel — Build Spec (v1)

Shared contract for the backend-dev and coder agents. Follow exactly; keep files <500 lines; match existing conventions.

## Scope (v1)
Backend-backed screens only: **Login, Dashboard, Bookings, Technicians (verify), Payouts (process), Customers.**
Out of scope v1 (no endpoints yet): Guarantees, Support inbox, Broadcast.

## Backend (work in `backend/`, hexagonal)

Files:
- `backend/src/application/admin/AdminService.ts` — business logic
- `backend/src/interface/http/routes/admin.ts` — `export const adminRouter: Router = Router();`
- register in `backend/src/interface/http/app.ts` under `/api/v1/admin`
- seed admin in `backend/src/infrastructure/database/seed.ts`
- integration tests (tester writes, but leave code testable)

Conventions (already in repo):
- `asyncHandler` (interface/http/asyncHandler.ts), `validate([...])` (interface/http/validate.ts)
- error classes from `shared/errors.ts`; errorHandler maps Prisma
- `authenticate` + `requireRole('ADMIN')` from `interface/http/middleware/auth.ts`
- envelope: success `{ data }`, error `{ error: { code, message } }`
- `bcryptjs` is installed; JWT via `jsonwebtoken` + `env().JWT_SECRET` (mirror AuthService token style)

### Endpoints (all under `/api/v1/admin`)
| Method | Path | Auth | Body / Query | Response `data` |
|---|---|---|---|---|
| POST | `/login` | none (+ authLimiter) | `{email, password}` | `{ accessToken, admin: {id,name,email} }` |
| GET | `/stats` | ADMIN | — | `{ totalBookings, pendingBookings, completedBookings, totalTechnicians, verifiedTechnicians, totalRevenueJod, pendingPayouts }` |
| GET | `/bookings` | ADMIN | `?status=&limit=&offset=` | `Booking[]` incl `customer, service, technician` |
| GET | `/technicians` | ADMIN | `?limit=&offset=` | `TechnicianProfile[]` incl `user` |
| POST | `/technicians/:id/verify` | ADMIN | — | updated profile (`isVerified=true`) |
| GET | `/customers` | ADMIN | `?limit=&offset=` | `User[]` where role=CUSTOMER |
| GET | `/payouts` | ADMIN | `?status=` | `Payout[]` incl `technician.user` |
| POST | `/payouts/:id/process` | ADMIN | — | updated payout (`status=COMPLETED, processedAt=now`) |

Notes:
- **Login:** `bcrypt.compare(password, admin.passwordHash)`; on success sign JWT `{userId: admin.id, role: 'ADMIN'}`. Do NOT reuse `AuthService.getMe` for admins (it queries the users table; admins live in `admin_users`).
- Apply the existing `authLimiter` to `/login` for brute-force defense (it's disabled when NODE_ENV=test).
- `totalRevenueJod` = sum of completed booking `totalJod`. Pagination defaults: limit 50, offset 0; validate as ints.
- Seed: `admin@fixly.jo` / password `admin12345` (bcrypt-hashed), name `مدير Fixly`. Upsert by email so re-seeding is idempotent.
- Verify `cd backend && ./node_modules/.bin/tsc --noEmit` is 0.

## Frontend (work in `admin/`, mirror `web/`)

`admin/` is empty except package.json + node_modules (react, react-dom, react-router-dom, vite, typescript).

Setup (copy from `web/`):
- deps: `pnpm add lucide-react sonner @tanstack/react-query zustand`; dev: `pnpm add -D tailwindcss @tailwindcss/vite autoprefixer postcss @vitejs/plugin-react @types/react @types/react-dom`
- `vite.config.ts`: react + tailwindcss plugins, **port 3001**, proxy `/api` → `http://localhost:4000`
- `src/index.css`: `@import` Google fonts (Tajawal) FIRST, then `@import "tailwindcss";`
- `tsconfig.json`: copy `web/tsconfig.json`
- `index.html`, `src/main.tsx` (QueryClientProvider), RTL `dir="rtl"`

Structure:
- `src/lib/api.ts` — fetch wrapper, clears session on 401 (mirror web), reads token from store
- `src/lib/store.ts` — zustand auth (accessToken + admin, localStorage)
- `src/components/` — Sidebar (RTL nav), Layout, shared bits (KPI card, table, StatusBadge)
- `src/pages/` — Login, Dashboard, Bookings, Technicians, Payouts, Customers
- Design system: primary `#1366D6`, bg `#F6F8FB`, Arabic labels, RTL. Login gates the app; unauthenticated → Login only.

Verify: `cd admin && ./node_modules/.bin/tsc -p tsconfig.json --noEmit` is 0 and `./node_modules/.bin/vite build` succeeds.

## Creds for testing
Admin: `admin@fixly.jo` / `admin12345`. Backend `:4000`, docker up. Admin app `:3001`.
Do NOT commit — lead commits after review.
