import { useState, useRef, useEffect, useMemo } from "react";
import {
  LayoutDashboard, Users, ClipboardList, ShieldCheck, MessageCircle, UserCircle,
  BarChart3, Bell, Search, Filter, Download, ChevronDown, ChevronUp, MoreHorizontal,
  TrendingUp, DollarSign, Star, AlertCircle, CheckCircle2, X, Eye, Ban, UserCheck,
  Medal, Flag, Video, Award, FileText, PlayCircle, Gauge, Megaphone, Lock,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { SERVICES, Avatar, ServiceIcon, MapMock, Stars, notify } from "./shared";

/* ─────────────────────────── Roles & nav ─────────────────────────── */
type Role = "super_admin" | "ops" | "finance" | "support";
type Nav =
  | "dash" | "techs" | "quality" | "conduct" | "bookings" | "guarantee"
  | "quotes" | "subs" | "support" | "customers" | "finance" | "broadcast";

const NAV: { id: Nav; label: string; Icon: React.ComponentType<{ size?: number }>; roles: Role[] }[] = [
  { id: "dash", label: "Dashboard", Icon: LayoutDashboard, roles: ["super_admin", "ops", "finance", "support"] },
  { id: "techs", label: "Technicians", Icon: Users, roles: ["super_admin", "ops"] },
  { id: "quality", label: "Quality & Trust", Icon: Medal, roles: ["super_admin", "ops"] },
  { id: "conduct", label: "Conduct reports", Icon: Flag, roles: ["super_admin", "ops"] },
  { id: "bookings", label: "Bookings", Icon: ClipboardList, roles: ["super_admin", "ops", "support"] },
  { id: "guarantee", label: "Guarantees", Icon: ShieldCheck, roles: ["super_admin", "ops", "support"] },
  { id: "quotes", label: "Video quotes", Icon: Video, roles: ["super_admin", "ops"] },
  { id: "subs", label: "Subscriptions", Icon: Star, roles: ["super_admin", "ops", "finance"] },
  { id: "support", label: "Support", Icon: MessageCircle, roles: ["super_admin", "support"] },
  { id: "customers", label: "Customers", Icon: UserCircle, roles: ["super_admin", "ops", "support"] },
  { id: "finance", label: "Financials", Icon: BarChart3, roles: ["super_admin", "finance"] },
  { id: "broadcast", label: "Broadcast", Icon: Megaphone, roles: ["super_admin", "ops"] },
];

const ADMINS: Record<string, { pw: string; name: string; role: Role }> = {
  "layla@fixly.jo": { pw: "admin", name: "Layla Hadid", role: "super_admin" },
  "ops@fixly.jo": { pw: "ops", name: "Omar Ops", role: "ops" },
  "finance@fixly.jo": { pw: "fin", name: "Farah Finance", role: "finance" },
  "support@fixly.jo": { pw: "sup", name: "Sami Support", role: "support" },
};

export default function AdminPanel() {
  const [session, setSession] = useState<{ email: string; name: string; role: Role } | null>({
    email: "layla@fixly.jo", name: "Layla Hadid", role: "super_admin",
  });
  const [nav, setNav] = useState<Nav>("dash");

  if (!session) return <AdminLogin onLogin={setSession} />;

  const allowed = NAV.filter(n => n.roles.includes(session.role));
  const activeNav = allowed.some(n => n.id === nav) ? nav : "dash";

  return (
    <div dir="ltr" className="w-full overflow-hidden flex" style={{ background: "#F6F8FB", height: 844, fontFamily: "Inter" }}>
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-5 py-5 flex items-center gap-2 border-b border-slate-100">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#1366D6" }}>🔧</div>
          <div>
            <div style={{ color: "#1366D6", fontWeight: 800, fontSize: 18 }}>Fixly</div>
            <div style={{ color: "#94A3B8", fontSize: 11 }}>Ops Console</div>
          </div>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {allowed.map(n => {
            const active = activeNav === n.id;
            return (
              <button key={n.id} onClick={() => setNav(n.id)} className="w-full px-4 py-2.5 flex items-center gap-3" style={{ background: active ? "#E8F1FE" : "transparent", color: active ? "#1366D6" : "#475569", borderRight: active ? "3px solid #1366D6" : "none", fontWeight: active ? 700 : 500, fontSize: 14 }}>
                <n.Icon size={18} />
                {n.label}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-slate-100 flex items-center gap-2">
          <Avatar name={session.name} size={32} />
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 13, fontWeight: 700 }}>{session.name}</div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>{session.role}</div>
          </div>
          <button onClick={() => { setSession(null); notify("Signed out"); }} aria-label="logout" className="p-1.5 rounded-lg hover:bg-slate-100"><Lock size={16} /></button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center px-6 gap-4">
          <div className="flex-1 flex items-center gap-2 max-w-md px-3 h-9 rounded-lg" style={{ background: "#F1F5F9" }}>
            <Search size={16} color="#94A3B8" />
            <input
              className="flex-1 bg-transparent outline-none"
              placeholder="Search bookings, technicians..."
              style={{ fontSize: 13 }}
              onKeyDown={(e) => { if (e.key === "Enter") notify(`Searching for "${(e.target as HTMLInputElement).value}"…`); }}
            />
          </div>
          <span className="text-xs px-2 py-1 rounded-full" style={{ background: "#E8F1FE", color: "#1366D6", fontWeight: 700 }}>{session.role}</span>
          <button onClick={() => notify("3 unread notifications")} aria-label="notifications" className="relative w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center">
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: "#E5484D" }} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {activeNav === "dash" && <Dashboard />}
          {activeNav === "techs" && <Technicians />}
          {activeNav === "quality" && <Quality />}
          {activeNav === "conduct" && <Conduct />}
          {activeNav === "bookings" && <Bookings />}
          {activeNav === "guarantee" && <Guarantees />}
          {activeNav === "quotes" && <Quotes />}
          {activeNav === "subs" && <Subscriptions />}
          {activeNav === "support" && <SupportInbox />}
          {activeNav === "customers" && <Customers />}
          {activeNav === "finance" && <Finance />}
          {activeNav === "broadcast" && <Broadcast />}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Admin login ─────────────────────────── */
function AdminLogin({ onLogin }: { onLogin: (s: { email: string; name: string; role: Role }) => void }) {
  const [email, setEmail] = useState("layla@fixly.jo");
  const [pw, setPw] = useState("admin");
  const [err, setErr] = useState("");
  const submit = () => {
    const a = ADMINS[email.trim().toLowerCase()];
    if (a && a.pw === pw) { onLogin({ email, name: a.name, role: a.role }); notify(`Welcome, ${a.name}`, "success"); }
    else setErr("Invalid email or password.");
  };
  return (
    <div dir="ltr" className="w-full flex items-center justify-center" style={{ height: 844, background: "#F6F8FB", fontFamily: "Inter" }}>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xl p-7" style={{ width: 380 }}>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#1366D6" }}>🔧</div>
          <div style={{ color: "#1366D6", fontWeight: 800, fontSize: 20 }}>Fixly Ops Console</div>
        </div>
        <p className="text-sm text-slate-500 mb-5">Sign in with your admin account.</p>
        <label className="text-xs font-semibold text-slate-500">Email</label>
        <input value={email} onChange={e => { setEmail(e.target.value); setErr(""); }} className="mt-1.5 mb-3 w-full h-11 rounded-lg border border-slate-200 px-3 outline-none text-sm" />
        <label className="text-xs font-semibold text-slate-500">Password</label>
        <input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(""); }} onKeyDown={e => { if (e.key === "Enter") submit(); }} className="mt-1.5 w-full h-11 rounded-lg border border-slate-200 px-3 outline-none text-sm" />
        {err && <div className="mt-2 text-xs" style={{ color: "#B91C1C" }}>{err}</div>}
        <button onClick={submit} className="mt-5 w-full h-11 rounded-lg font-semibold" style={{ background: "#1366D6", color: "#FFF" }}>Sign in</button>
        <div className="mt-4 text-xs text-slate-400 leading-relaxed">
          Demo roles: layla@fixly.jo/admin (super_admin) · ops@fixly.jo/ops · finance@fixly.jo/fin · support@fixly.jo/sup
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Shared local helpers ─────────────────────────── */
function AdminConfirm({ title, body, confirmLabel = "Confirm", variant = "primary", onConfirm, onCancel }: {
  title: string; body?: string; confirmLabel?: string; variant?: "primary" | "destructive";
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div className="bg-white rounded-2xl p-6 shadow-2xl" style={{ width: 380 }}>
        <h3 className="font-bold text-lg">{title}</h3>
        {body && <p className="text-slate-500 text-sm mt-2">{body}</p>}
        <div className="mt-5 flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: variant === "destructive" ? "#E5484D" : "#1366D6" }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* Drawer that slides from the right */
function Drawer({ title, onClose, children, width = 460 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="bg-white h-full overflow-y-auto shadow-2xl" style={{ width }} onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-slate-100 flex items-center justify-between z-10">
          <h3 className="font-bold text-lg">{title}</h3>
          <button onClick={onClose} aria-label="close" className="p-1.5 rounded-lg hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function DateRangePicker({ options = ["Today", "Last 7 days", "Last 30 days", "Last 6 months"], initial = 1 }: { options?: string[]; initial?: number }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold flex items-center gap-2">
        <ChevronDown size={14} /> {options[sel]}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 bg-white rounded-xl shadow-xl border border-slate-100 py-1 min-w-[160px]">
          {options.map((o, i) => (
            <button key={o} onClick={() => { setSel(i); setOpen(false); notify(`Range: ${o}`); }} className="w-full px-3 py-2 text-sm text-left hover:bg-slate-50" style={{ fontWeight: i === sel ? 700 : 500, color: i === sel ? "#1366D6" : "#0F172A" }}>{o}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, delta, icon, color }: { label: string; value: string; delta?: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-100">
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: color + "20", color }}>{icon}</div>
        {delta && <span className="text-xs font-semibold" style={{ color: "#15803D" }}>{delta}</span>}
      </div>
      <div className="mt-3 text-2xl font-bold">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

/** Small operational metric tile. */
function OpsStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl p-3 border border-slate-100">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

/** Sort-header cell — click toggles direction. */
function SortTh({ label, col, sort, setSort }: { label: string; col: string; sort: { col: string; dir: 1 | -1 }; setSort: (s: { col: string; dir: 1 | -1 }) => void }) {
  const active = sort.col === col;
  return (
    <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide cursor-pointer select-none" onClick={() => setSort({ col, dir: active && sort.dir === 1 ? -1 : 1 })}>
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sort.dir === 1 ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
      </span>
    </th>
  );
}

function Pagination({ total, page, pageSize, setPage }: { total: number; page: number; pageSize: number; setPage: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
      <span>Showing {from}–{to} of {total}</span>
      <div className="flex gap-1">
        <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40">‹</button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
          <button key={p} onClick={() => setPage(p)} className="px-2 py-1 rounded border border-slate-200" style={{ background: p === page ? "#1366D6" : "#FFF", color: p === page ? "#FFF" : "#475569" }}>{p}</button>
        ))}
        <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40">›</button>
      </div>
    </div>
  );
}

function TierChip({ tier }: { tier: string }) {
  const map: Record<string, [string, string, string]> = {
    probation: ["تحت التجربة", "#FEF3C7", "#B45309"],
    verified: ["موثّق", "#DBEAFE", "#1366D6"],
    pro: ["محترف", "#EDE9FE", "#7C3AED"],
    elite: ["نخبة", "#DCFCE7", "#15803D"],
  };
  const [ar, bg, fg] = map[tier] ?? [tier, "#E2E8F0", "#475569"];
  return <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: bg, color: fg }}>{ar}</span>;
}

/** Trigger a real CSV download. */
function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  notify(`Exported ${filename}`, "success");
}

/* ─────────────────────────── Dashboard ─────────────────────────── */
function Dashboard() {
  const revenueData = [
    { d: "Mon", revenue: 1200 }, { d: "Tue", revenue: 1450 }, { d: "Wed", revenue: 1100 },
    { d: "Thu", revenue: 1800 }, { d: "Fri", revenue: 2100 }, { d: "Sat", revenue: 2400 }, { d: "Sun", revenue: 1900 },
  ];
  const byService = SERVICES.map((s, i) => ({ name: s.en, count: [72, 58, 64, 31, 42][i] }));
  const COLORS = ["#D97706", "#1366D6", "#0E7490", "#BE185D", "#15803D"];
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Today, 08/06/2026 · Amman</p>
        </div>
        <DateRangePicker />
      </div>

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-5">
        <KPI label="Today's revenue" value="JOD 1,920" delta="+12%" icon={<DollarSign size={18} />} color="#1366D6" />
        <KPI label="Bookings today" value="64" delta="+8%" icon={<ClipboardList size={18} />} color="#0FB5A6" />
        <KPI label="Active technicians" value="48" icon={<Users size={18} />} color="#F5A623" />
        <KPI label="Avg rating" value="4.8 ★" icon={<Star size={18} />} color="#1FAA59" />
        <KPI label="Open guarantees" value="3" icon={<ShieldCheck size={18} />} color="#E5484D" />
      </div>

      {/* Operational KPIs */}
      <div className="mt-4 bg-white rounded-2xl p-4 border border-slate-100">
        <div className="flex items-center gap-2 mb-3"><Gauge size={16} color="#475569" /><h3 className="font-bold">Operational KPIs</h3></div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <OpsStat label="Acceptance rate" value="88%" />
          <OpsStat label="Avg time-to-assign" value="2.4 min" />
          <OpsStat label="Arrival delay" value="6 min" />
          <OpsStat label="Completion rate" value="94%" />
          <OpsStat label="Cancellation rate" value="4%" />
          <OpsStat label="Complaint rate" value="2%" />
          <OpsStat label="Warranty / redo" value="3%" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
          <OpsStat label="Repeat-booking rate" value="41%" />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-3 gap-4 mt-4">
        <div className="col-span-2 bg-white rounded-2xl p-5 border border-slate-100">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Revenue trend</h3>
            <span className="text-xs text-slate-500">JOD</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={revenueData} key="dash-line">
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="d" tick={{ fontSize: 11, fill: "#94A3B8" }} />
              <YAxis tick={{ fontSize: 11, fill: "#94A3B8" }} />
              <Tooltip cursor={false} />
              <Line type="monotone" dataKey="revenue" stroke="#1366D6" strokeWidth={3} dot={{ r: 4, fill: "#1366D6" }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100">
          <h3 className="font-bold">Bookings by service</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={byService} dataKey="count" nameKey="name" innerRadius={45} outerRadius={78} isAnimationActive={false}>
                {byService.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip cursor={false} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Live activity + operational panels */}
      <div className="grid grid-cols-3 gap-4 mt-4">
        <div className="col-span-2 bg-white rounded-2xl p-5 border border-slate-100">
          <h3 className="font-bold">Live activity</h3>
          <div className="mt-3 space-y-2">
            {[
              { ic: "✅", t: "Booking #FX-20603 accepted by خالد المومني", time: "Just now", c: "#15803D" },
              { ic: "🔧", t: "Service started — كهرباء @ خلدا", time: "2 min ago", c: "#B45309" },
              { ic: "💰", t: "Payment captured: JOD 50 (Apple Pay)", time: "5 min ago", c: "#1366D6" },
              { ic: "⚠️", t: "Guarantee ticket #GR-104 opened — needs review", time: "12 min ago", c: "#E5484D" },
              { ic: "👤", t: "New customer registered: محمد الزعبي", time: "20 min ago", c: "#0FB5A6" },
            ].map((a, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0 border-slate-100">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: a.c + "20" }}>{a.ic}</div>
                <div className="flex-1 text-sm">{a.t}</div>
                <span className="text-xs text-slate-500">{a.time}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {[
            { label: "Open orders", detail: "12 in progress · 4 arriving", bg: "#DBEAFE", fg: "#1366D6" },
            { label: "Late orders (past arrival SLA)", detail: "2 orders · comp issued", bg: "#FEE2E2", fg: "#B91C1C" },
            { label: "High-risk orders", detail: "new customer + probation tech: 3", bg: "#FEF3C7", fg: "#B45309" },
            { label: "Cancellations today", detail: "3 · reasons logged", bg: "#F1F5F9", fg: "#475569" },
          ].map(p => (
            <div key={p.label} className="p-3 rounded-lg" style={{ background: p.bg }}>
              <div className="flex items-center gap-2 text-sm font-bold" style={{ color: p.fg }}><AlertCircle size={14} /> {p.label}</div>
              <div className="text-xs mt-1">{p.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Technicians ─────────────────────────── */
type Tech = { name: string; phone: string; rating: number; jobs: number; status: string; svc: string; tier: string; district: string; bgCheck: string; insured: boolean; flags: number; offPlatform: number };
const SEED_TECHS: Tech[] = [
  { name: "خالد المومني", phone: "+962 79 555 1234", rating: 4.9, jobs: 320, status: "approved", svc: "كهرباء", tier: "elite", district: "عبدون", bgCheck: "passed", insured: true, flags: 0, offPlatform: 0 },
  { name: "عمر الشريف", phone: "+962 79 444 5678", rating: 4.7, jobs: 180, status: "approved", svc: "سباكة", tier: "pro", district: "الصويفية", bgCheck: "passed", insured: true, flags: 1, offPlatform: 1 },
  { name: "سامي النسور", phone: "+962 79 333 9999", rating: 4.8, jobs: 95, status: "approved", svc: "تكييف", tier: "verified", district: "خلدا", bgCheck: "passed", insured: false, flags: 0, offPlatform: 0 },
  { name: "محمد القضاة", phone: "+962 79 222 8888", rating: 0, jobs: 0, status: "pending", svc: "دهان", tier: "probation", district: "الجبيهة", bgCheck: "pending", insured: false, flags: 0, offPlatform: 0 },
  { name: "أحمد العامري", phone: "+962 79 111 7777", rating: 0, jobs: 0, status: "pending", svc: "كهرباء", tier: "probation", district: "تلاع العلي", bgCheck: "pending", insured: false, flags: 0, offPlatform: 0 },
  { name: "ياسر العواملة", phone: "+962 79 000 6666", rating: 3.2, jobs: 22, status: "suspended", svc: "سباكة", tier: "probation", district: "مرج الحمام", bgCheck: "passed", insured: false, flags: 3, offPlatform: 2 },
  { name: "بلال الخطيب", phone: "+962 79 777 2222", rating: 4.6, jobs: 60, status: "approved", svc: "تكييف", tier: "verified", district: "دير غبار", bgCheck: "passed", insured: true, flags: 0, offPlatform: 0 },
  { name: "زيد الطراونة", phone: "+962 79 888 3333", rating: 0, jobs: 0, status: "rejected", svc: "دهان", tier: "probation", district: "الدوار السابع", bgCheck: "failed", insured: false, flags: 0, offPlatform: 0 },
];

const STATCOLOR: Record<string, [string, string]> = {
  approved: ["#DCFCE7", "#15803D"],
  pending: ["#FEF3C7", "#B45309"],
  rejected: ["#FEE2E2", "#B91C1C"],
  suspended: ["#FEE2E2", "#B91C1C"],
};

type TechAction = "view" | "approve" | "reject" | "suspend" | "reinstate";
function TechActionsMenu({ status, onClose, onAction }: { status: string; onClose: () => void; onAction: (a: TechAction) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute z-40 bg-white rounded-xl shadow-xl border border-slate-100 py-1" style={{ right: 0, top: 28, minWidth: 180 }}>
      <button onClick={() => onAction("view")} className="w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 flex items-center gap-2"><Eye size={14} color="#475569" /> View profile</button>
      {status === "pending" && <button onClick={() => onAction("approve")} className="w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 flex items-center gap-2" style={{ color: "#15803D" }}><UserCheck size={14} /> Approve</button>}
      {status === "pending" && <button onClick={() => onAction("reject")} className="w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 flex items-center gap-2" style={{ color: "#B91C1C" }}><X size={14} /> Reject</button>}
      {status !== "suspended" && <button onClick={() => onAction("suspend")} className="w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 flex items-center gap-2" style={{ color: "#B91C1C" }}><Ban size={14} /> Block / suspend</button>}
      {status === "suspended" && <button onClick={() => onAction("reinstate")} className="w-full px-4 py-2.5 text-sm text-left hover:bg-slate-50 flex items-center gap-2" style={{ color: "#15803D" }}><UserCheck size={14} /> Reinstate</button>}
    </div>
  );
}

function Technicians() {
  const [techs, setTechs] = useState<Tech[]>(SEED_TECHS);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [filterTab, setFilterTab] = useState(0);
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 }>({ col: "jobs", dir: -1 });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<Tech | null>(null);
  const [techConfirm, setTechConfirm] = useState<{ name: string; action: Exclude<TechAction, "view"> } | null>(null);
  const [loading, setLoading] = useState(true);
  const pageSize = 5;

  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);

  const statusFilter = ["all", "approved", "pending", "suspended", "rejected"][filterTab];
  const filtered = useMemo(() => {
    let list = statusFilter === "all" ? techs : techs.filter(t => t.status === statusFilter);
    list = [...list].sort((a, b) => {
      const av = (a as any)[sort.col], bv = (b as any)[sort.col];
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });
    return list;
  }, [techs, statusFilter, sort]);

  useEffect(() => { setPage(1); }, [filterTab]);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const applyTechAction = (name: string, action: Exclude<TechAction, "view">) => {
    const next = action === "suspend" ? "suspended" : action === "reject" ? "rejected" : "approved";
    setTechs(ts => ts.map(t => t.name === name ? { ...t, status: next } : t));
    notify(`${action === "suspend" ? "Suspended" : action === "reject" ? "Rejected" : action === "reinstate" ? "Reinstated" : "Approved"} ${name}`, "success");
    setTechConfirm(null);
    setOpenMenu(null);
    setDrawer(null);
  };

  const handleAction = (t: Tech, action: TechAction) => {
    setOpenMenu(null);
    if (action === "view") { setDrawer(t); return; }
    setTechConfirm({ name: t.name, action });
  };

  const counts = {
    all: techs.length,
    approved: techs.filter(t => t.status === "approved").length,
    pending: techs.filter(t => t.status === "pending").length,
    suspended: techs.filter(t => t.status === "suspended").length,
    rejected: techs.filter(t => t.status === "rejected").length,
  };
  const tabs = [`All (${counts.all})`, `Approved (${counts.approved})`, `Pending (${counts.pending})`, `Suspended (${counts.suspended})`, `Rejected (${counts.rejected})`];

  const toggleAll = () => {
    const allIds = pageRows.map(t => t.name);
    const allSel = allIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      allIds.forEach(id => allSel ? next.delete(id) : next.add(id));
      return next;
    });
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Technicians</h1>
        <div className="flex items-center gap-2">
          {selected.size > 0 && <button onClick={() => { notify(`Approved ${selected.size} technicians`, "success"); setSelected(new Set()); }} className="px-3 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "#1FAA59" }}>Approve {selected.size}</button>}
          <button onClick={() => notify("Invite link copied to clipboard", "success")} className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold">+ Invite</button>
        </div>
      </div>

      <div className="mt-4 flex gap-2 flex-wrap">
        {tabs.map((t, i) => (
          <button key={t} onClick={() => setFilterTab(i)} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: filterTab === i ? "#1366D6" : "#FFF", color: filterTab === i ? "#FFF" : "#475569", border: "1px solid " + (filterTab === i ? "#1366D6" : "#E2E8F0") }}>{t}</button>
        ))}
      </div>

      <div className="mt-4 bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "#F8FAFC", color: "#475569" }}>
            <tr className="text-left">
              <th className="px-4 py-3 w-8"><input type="checkbox" checked={pageRows.length > 0 && pageRows.every(t => selected.has(t.name))} onChange={toggleAll} /></th>
              <SortTh label="Technician" col="name" sort={sort} setSort={setSort} />
              <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide">Service</th>
              <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide">Phone</th>
              <SortTh label="Rating" col="rating" sort={sort} setSort={setSort} />
              <SortTh label="Jobs" col="jobs" sort={sort} setSort={setSort} />
              <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wide">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-slate-100"><td className="px-4 py-4" colSpan={8}><div className="h-4 rounded bg-slate-100 animate-pulse" /></td></tr>
              ))
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-sm">No technicians match this filter.</td></tr>
            ) : pageRows.map((t, i) => {
              const [bg, fg] = STATCOLOR[t.status];
              return (
                <tr key={t.name} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3"><input type="checkbox" checked={selected.has(t.name)} onChange={() => setSelected(prev => { const n = new Set(prev); n.has(t.name) ? n.delete(t.name) : n.add(t.name); return n; })} /></td>
                  <td className="px-4 py-3"><button onClick={() => setDrawer(t)} className="flex items-center gap-2 text-left"><Avatar name={t.name} size={32} /><span className="font-semibold">{t.name}</span></button></td>
                  <td className="px-4 py-3">{t.svc}</td>
                  <td className="px-4 py-3 font-mono text-xs">{t.phone}</td>
                  <td className="px-4 py-3">{t.rating > 0 ? <Stars rating={t.rating} size={12} /> : <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 font-semibold">{t.jobs}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: bg, color: fg }}>{t.status}</span></td>
                  <td className="px-4 py-3 relative">
                    <button onClick={() => setOpenMenu(openMenu === i ? null : i)} className="p-1 rounded hover:bg-slate-100"><MoreHorizontal size={16} color="#94A3B8" /></button>
                    {openMenu === i && <TechActionsMenu status={t.status} onClose={() => setOpenMenu(null)} onAction={(a) => handleAction(t, a)} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pagination total={filtered.length} page={page} pageSize={pageSize} setPage={setPage} />
      </div>

      {drawer && (
        <Drawer title="Technician profile" onClose={() => setDrawer(null)}>
          <div className="flex items-center gap-3">
            <Avatar name={drawer.name} size={56} verified={drawer.status === "approved"} />
            <div>
              <div className="font-bold text-lg">{drawer.name}</div>
              <div className="text-sm text-slate-500">{drawer.svc} · {drawer.district}</div>
              <div className="mt-1 flex items-center gap-2"><TierChip tier={drawer.tier} />{drawer.insured && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "#DCFCE7", color: "#15803D", fontWeight: 700 }}>Insured</span>}</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <OpsStat label="Rating" value={drawer.rating > 0 ? drawer.rating.toFixed(1) : "—"} />
            <OpsStat label="Jobs" value={String(drawer.jobs)} />
            <OpsStat label="Flags" value={String(drawer.flags)} />
          </div>

          <h4 className="font-bold mt-5 mb-2">Documents</h4>
          <div className="grid grid-cols-3 gap-2">
            {["ID / KYC", "Certificate", "Selfie"].map(d => (
              <button key={d} onClick={() => notify(`Opening ${d}…`)} className="aspect-[3/4] rounded-lg bg-slate-100 flex flex-col items-center justify-center gap-1 hover:bg-slate-200"><FileText size={22} color="#475569" /><span className="text-xs text-slate-600">{d}</span></button>
            ))}
          </div>

          <h4 className="font-bold mt-5 mb-2">Intro video</h4>
          <button onClick={() => notify("Playing intro video…")} className="w-full aspect-video rounded-lg bg-slate-900 flex items-center justify-center"><PlayCircle size={40} color="#FFF" /></button>

          <h4 className="font-bold mt-5 mb-2">Scorecard</h4>
          <div className="space-y-1.5 text-sm">
            {[["التقييم (Rating)", "4.8"], ["الالتزام بالوقت (On-time)", "96%"], ["نسبة إعادة العمل (Redo/warranty)", "3%"], ["نسبة الشكاوى (Complaints)", "2%"], ["نسبة القبول (Acceptance)", "88%"], ["Background check", drawer.bgCheck], ["Off-platform flags", String(drawer.offPlatform)]].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-1 border-b last:border-0 border-slate-100"><span className="text-slate-500">{k}</span><span className="font-semibold">{v}</span></div>
            ))}
          </div>

          <div className="mt-5 flex gap-2">
            {drawer.status === "pending" && <button onClick={() => setTechConfirm({ name: drawer.name, action: "approve" })} className="flex-1 h-10 rounded-lg text-sm font-semibold text-white" style={{ background: "#1FAA59" }}>Approve</button>}
            {drawer.status === "pending" && <button onClick={() => setTechConfirm({ name: drawer.name, action: "reject" })} className="flex-1 h-10 rounded-lg text-sm font-semibold border border-slate-200">Reject</button>}
            {drawer.status !== "suspended" && <button onClick={() => setTechConfirm({ name: drawer.name, action: "suspend" })} className="flex-1 h-10 rounded-lg text-sm font-semibold text-white" style={{ background: "#E5484D" }}>Block</button>}
            {drawer.status === "suspended" && <button onClick={() => setTechConfirm({ name: drawer.name, action: "reinstate" })} className="flex-1 h-10 rounded-lg text-sm font-semibold text-white" style={{ background: "#1FAA59" }}>Reinstate</button>}
          </div>
        </Drawer>
      )}

      {techConfirm && (
        <AdminConfirm
          title={techConfirm.action === "approve" ? "Approve technician?" : techConfirm.action === "reject" ? "Reject technician?" : techConfirm.action === "suspend" ? "Block technician?" : "Reinstate technician?"}
          body={`This will ${techConfirm.action === "suspend" ? "block" : techConfirm.action} ${techConfirm.name}. The technician will be notified${techConfirm.action === "reject" ? " with the reason" : ""}.`}
          confirmLabel={techConfirm.action[0].toUpperCase() + techConfirm.action.slice(1)}
          variant={techConfirm.action === "suspend" || techConfirm.action === "reject" ? "destructive" : "primary"}
          onConfirm={() => applyTechAction(techConfirm.name, techConfirm.action)}
          onCancel={() => setTechConfirm(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── Quality & Trust ─────────────────────────── */
function Quality() {
  const [techs, setTechs] = useState(SEED_TECHS.filter(t => t.status === "approved" || t.status === "suspended"));
  const [override, setOverride] = useState<{ name: string; tier: string } | null>(null);
  const [detail, setDetail] = useState<Tech | null>(null);
  const tiers = ["probation", "verified", "pro", "elite"];
  const tierLabel: Record<string, string> = { probation: "تحت التجربة", verified: "موثّق", pro: "محترف", elite: "نخبة" };

  const applyOverride = () => {
    if (!override) return;
    setTechs(ts => ts.map(t => t.name === override.name ? { ...t, tier: override.tier } : t));
    notify(`${override.name} → ${tierLabel[override.tier]}`, "success");
    setOverride(null);
  };

  return (
    <div className="relative">
      <h1 className="text-2xl font-bold">Quality &amp; Trust</h1>
      <p className="text-sm text-slate-500 mt-1">Trust-tier board · background checks · skills tests</p>

      <div className="mt-4 grid grid-cols-4 gap-3">
        {tiers.map(tier => (
          <div key={tier} className="bg-white rounded-2xl border border-slate-100 p-3">
            <div className="flex items-center gap-2 mb-3"><Award size={16} color="#475569" /><TierChip tier={tier} /><span className="ml-auto text-xs text-slate-400">{techs.filter(t => t.tier === tier).length}</span></div>
            <div className="space-y-2">
              {techs.filter(t => t.tier === tier).map(t => (
                <button key={t.name} onClick={() => setDetail(t)} className="w-full text-left p-2 rounded-lg border border-slate-100 hover:bg-slate-50">
                  <div className="flex items-center gap-2"><Avatar name={t.name} size={28} /><span className="text-sm font-semibold flex-1 truncate">{t.name}</span></div>
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-xs">
                    <span className="px-1.5 py-0.5 rounded" style={{ background: t.bgCheck === "passed" ? "#DCFCE7" : t.bgCheck === "failed" ? "#FEE2E2" : "#FEF3C7", color: t.bgCheck === "passed" ? "#15803D" : t.bgCheck === "failed" ? "#B91C1C" : "#B45309" }}>BG: {t.bgCheck}</span>
                    {t.insured && <span className="px-1.5 py-0.5 rounded" style={{ background: "#DBEAFE", color: "#1366D6" }}>Insured</span>}
                    {t.offPlatform > 0 && <span className="px-1.5 py-0.5 rounded" style={{ background: "#FEE2E2", color: "#B91C1C" }}>Off-platform {t.offPlatform}</span>}
                  </div>
                </button>
              ))}
              {techs.filter(t => t.tier === tier).length === 0 && <div className="text-xs text-slate-400 text-center py-4">Empty</div>}
            </div>
          </div>
        ))}
      </div>

      {detail && (
        <Drawer title="Daily performance / scorecard" onClose={() => setDetail(null)}>
          <div className="flex items-center gap-3">
            <Avatar name={detail.name} size={56} />
            <div><div className="font-bold text-lg">{detail.name}</div><div className="text-sm text-slate-500">{detail.svc} · {detail.district}</div><div className="mt-1"><TierChip tier={detail.tier} /></div></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <OpsStat label="التقييم (Rating)" value="4.8" />
            <OpsStat label="الالتزام بالوقت" value="96%" />
            <OpsStat label="إعادة العمل / الضمان" value="3%" />
            <OpsStat label="نسبة الشكاوى" value="2%" />
            <OpsStat label="نسبة القبول" value="88%" />
            <OpsStat label="Off-platform flags" value={String(detail.offPlatform)} />
          </div>
          <div className="mt-4 space-y-2">
            <button onClick={() => notify(`Skills test scheduled for ${detail.name}`, "success")} className="w-full h-10 rounded-lg text-sm font-semibold border border-slate-200 flex items-center justify-center gap-2"><CheckCircle2 size={16} /> Schedule skills test</button>
            <button onClick={() => notify(`Background check requested for ${detail.name}`, "success")} className="w-full h-10 rounded-lg text-sm font-semibold border border-slate-200">Re-run background check</button>
            <button onClick={() => setOverride({ name: detail.name, tier: detail.tier })} className="w-full h-10 rounded-lg text-sm font-semibold text-white" style={{ background: "#1366D6" }}>Set / override tier</button>
          </div>
        </Drawer>
      )}

      {override && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl" style={{ width: 380 }}>
            <h3 className="font-bold text-lg">Override trust tier</h3>
            <p className="text-slate-500 text-sm mt-1">{override.name}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {tiers.map(t => (
                <button key={t} onClick={() => setOverride({ ...override, tier: t })} className="p-2 rounded-lg border-2 text-sm font-semibold" style={{ borderColor: override.tier === t ? "#1366D6" : "#E2E8F0", background: override.tier === t ? "#E8F1FE" : "#FFF" }}>{tierLabel[t]}</button>
              ))}
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <button onClick={() => setOverride(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold">Cancel</button>
              <button onClick={applyOverride} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "#1366D6" }}>Confirm override</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Conduct reports ─────────────────────────── */
type Report = { id: string; tech: string; kind: string; reporter: string; when: string; status: "open" | "upheld" | "dismissed"; note: string };
const KIND_AR: Record<string, string> = {
  off_platform_solicit: "محاولة خارج المنصة", no_show: "عدم حضور", quality: "جودة", safety: "سلامة", other: "أخرى",
};
function Conduct() {
  const [reports, setReports] = useState<Report[]>([
    { id: "CR-51", tech: "عمر الشريف", kind: "off_platform_solicit", reporter: "أحمد العلي", when: "07/06 10:15 ص", status: "open", note: "طلب الدفع نقداً خارج التطبيق." },
    { id: "CR-50", tech: "ياسر العواملة", kind: "no_show", reporter: "سارة خالد", when: "06/06 4:00 م", status: "open", note: "لم يحضر في الموعد المحدد." },
    { id: "CR-49", tech: "ياسر العواملة", kind: "quality", reporter: "رنا حدّاد", when: "05/06", status: "upheld", note: "عمل غير مكتمل." },
    { id: "CR-48", tech: "سامي النسور", kind: "safety", reporter: "يوسف العمري", when: "03/06", status: "dismissed", note: "بلاغ غير دقيق." },
  ]);
  const [tab, setTab] = useState(0);
  const [confirm, setConfirm] = useState<{ id: string; action: "upheld" | "dismissed" } | null>(null);
  const statusFilter = ["open", "upheld", "dismissed"][tab] as Report["status"];
  const rows = reports.filter(r => r.status === statusFilter);

  const resolve = (id: string, action: "upheld" | "dismissed") => {
    setReports(rs => rs.map(r => r.id === id ? { ...r, status: action } : r));
    notify(action === "upheld" ? "تم تأكيد البلاغ — احتُسبت مخالفة على الفني" : "تم رفض البلاغ", "success");
    setConfirm(null);
  };

  return (
    <div className="relative">
      <h1 className="text-2xl font-bold">Conduct reports</h1>
      <div className="mt-4 flex gap-2">
        {["Open", "Upheld", "Dismissed"].map((t, i) => (
          <button key={t} onClick={() => setTab(i)} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: tab === i ? "#1366D6" : "#FFF", color: tab === i ? "#FFF" : "#475569", border: "1px solid " + (tab === i ? "#1366D6" : "#E2E8F0") }}>{t} ({reports.filter(r => r.status === (["open", "upheld", "dismissed"][i])).length})</button>
        ))}
      </div>

      <div className="mt-4 bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "#F8FAFC", color: "#475569" }}>
            <tr className="text-left">{["ID", "Technician", "Kind", "Reporter", "When", "Note", ""].map(h => <th key={h} className="px-4 py-3 font-semibold text-xs uppercase">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400 text-sm">لا توجد بلاغات</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-mono font-semibold">{r.id}</td>
                <td className="px-4 py-3">{r.tech}</td>
                <td className="px-4 py-3">{KIND_AR[r.kind]}</td>
                <td className="px-4 py-3">{r.reporter}</td>
                <td className="px-4 py-3 text-slate-500">{r.when}</td>
                <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">{r.note}</td>
                <td className="px-4 py-3">
                  {r.status === "open" ? (
                    <div className="flex gap-1.5">
                      <button onClick={() => setConfirm({ id: r.id, action: "upheld" })} className="px-2.5 py-1 rounded-lg text-xs font-semibold text-white" style={{ background: "#E5484D" }}>تأكيد</button>
                      <button onClick={() => resolve(r.id, "dismissed")} className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-slate-200">رفض</button>
                    </div>
                  ) : <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: r.status === "upheld" ? "#FEE2E2" : "#E2E8F0", color: r.status === "upheld" ? "#B91C1C" : "#475569" }}>{r.status}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {confirm && (
        <AdminConfirm
          title="تأكيد البلاغ؟"
          body="سيُحتسب على الفني مخالفة قد تخفّض فئته أو تؤدي إلى إيقافه."
          confirmLabel="تأكيد"
          variant="destructive"
          onConfirm={() => resolve(confirm.id, "upheld")}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── Bookings ─────────────────────────── */
/* Exact booking-status enums per spec §10, with AR label + badge color. */
type BookingStatus = "awaiting_payment" | "pending" | "confirmed" | "en_route" | "arrived" | "in_progress" | "completed" | "cancelled" | "disputed";
const BOOKING_STATUS_META: Record<BookingStatus, { ar: string; bg: string; fg: string }> = {
  awaiting_payment: { ar: "بانتظار الدفع", bg: "#E2E8F0", fg: "#475569" },
  pending: { ar: "جارٍ البحث عن فني", bg: "#DBEAFE", fg: "#1366D6" },
  confirmed: { ar: "تم القبول", bg: "#DBEAFE", fg: "#1366D6" },
  en_route: { ar: "الفني في الطريق", bg: "#CCFBF1", fg: "#0F766E" },
  arrived: { ar: "الفني وصل", bg: "#CCFBF1", fg: "#0F766E" },
  in_progress: { ar: "الخدمة جارية", bg: "#FEF3C7", fg: "#B45309" },
  completed: { ar: "مكتملة", bg: "#DCFCE7", fg: "#15803D" },
  cancelled: { ar: "ملغاة", bg: "#FEE2E2", fg: "#B91C1C" },
  disputed: { ar: "نزاع", bg: "#FEE2E2", fg: "#B91C1C" },
};
function BookingBadge({ status }: { status: BookingStatus }) {
  const s = BOOKING_STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: s.bg, color: s.fg, fontSize: 11, fontWeight: 600 }}>
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: s.fg }} />
      {s.ar}
    </span>
  );
}
type Booking = { id: string; cust: string; svc: string; tech: string; amount: number; status: BookingStatus; zone: string; district: string; d: string };
const SEED_BOOKINGS: Booking[] = [
  { id: "FX-20603", cust: "أحمد العلي", svc: "elec", tech: "خالد المومني", amount: 50, status: "en_route", zone: "شمال عمّان", district: "خلدا", d: "08/06 3:30 م" },
  { id: "FX-20602", cust: "سارة خالد", svc: "ac", tech: "سامي النسور", amount: 30, status: "in_progress", zone: "وسط عمّان", district: "عبدون", d: "08/06 2:45 م" },
  { id: "FX-20601", cust: "محمد الزعبي", svc: "plumb", tech: "عمر الشريف", amount: 40, status: "completed", zone: "شمال عمّان", district: "الجبيهة", d: "08/06 1:20 م" },
  { id: "FX-20600", cust: "رنا حدّاد", svc: "paint", tech: "—", amount: 70, status: "pending", zone: "وسط عمّان", district: "الصويفية", d: "08/06 1:05 م" },
  { id: "FX-20599", cust: "يوسف العمري", svc: "furn", tech: "خالد المومني", amount: 35, status: "cancelled", zone: "شمال عمّان", district: "تلاع العلي", d: "08/06 11:30 ص" },
  { id: "FX-20598", cust: "أحمد العلي", svc: "elec", tech: "بلال الخطيب", amount: 50, status: "arrived", zone: "وسط عمّان", district: "دير غبار", d: "08/06 10:10 ص" },
  { id: "FX-20597", cust: "سارة خالد", svc: "plumb", tech: "عمر الشريف", amount: 40, status: "disputed", zone: "وسط عمّان", district: "الدوار السابع", d: "07/06 5:00 م" },
  { id: "FX-20596", cust: "محمد الزعبي", svc: "ac", tech: "سامي النسور", amount: 30, status: "confirmed", zone: "شمال عمّان", district: "مرج الحمام", d: "07/06 3:20 م" },
];
const BOOKING_STATUSES: BookingStatus[] = ["awaiting_payment", "pending", "confirmed", "en_route", "arrived", "in_progress", "completed", "cancelled", "disputed"];

function Bookings() {
  const [statusF, setStatusF] = useState<string>("all");
  const [zoneF, setZoneF] = useState<string>("all");
  const [detail, setDetail] = useState<Booking | null>(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 }>({ col: "id", dir: -1 });
  const pageSize = 5;

  const filtered = useMemo(() => {
    let list = SEED_BOOKINGS.filter(b => (statusF === "all" || b.status === statusF) && (zoneF === "all" || b.zone === zoneF));
    list = [...list].sort((a, b) => {
      const av = (a as any)[sort.col], bv = (b as any)[sort.col];
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });
    return list;
  }, [statusF, zoneF, sort]);
  useEffect(() => { setPage(1); }, [statusF, zoneF]);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="relative">
      <h1 className="text-2xl font-bold">Bookings</h1>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold">Active bookings · live map</h3>
            <span className="text-xs text-slate-500">{SEED_BOOKINGS.filter(b => ["en_route", "arrived", "in_progress"].includes(b.status)).length} active</span>
          </div>
          <MapMock height={280} showRoute showTechPin techLabel="خالد" customerLabel="أحمد" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <h3 className="font-bold">Status distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={[{ name: "In progress", v: 8 }, { name: "Arriving", v: 4 }, { name: "Completed", v: 52 }, { name: "Cancelled", v: 3 }]} dataKey="v" nameKey="name" innerRadius={45} outerRadius={75} isAnimationActive={false}>
                {["#F5A623", "#0FB5A6", "#1FAA59", "#E5484D"].map((c) => <Cell key={c} fill={c} />)}
              </Pie>
              <Tooltip cursor={false} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 text-xs">
            {[["In progress", "#F5A623", 8], ["Arriving", "#0FB5A6", 4], ["Completed", "#1FAA59", 52], ["Cancelled", "#E5484D", 3]].map(([l, c, v]) => (
              <div key={l as string} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c as string }} /><span className="flex-1">{l as string}</span><span className="font-semibold">{v as number}</span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-bold">All bookings</h3>
          <div className="flex gap-2 items-center">
            <select value={statusF} onChange={e => setStatusF(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs border border-slate-200 outline-none">
              <option value="all">All statuses</option>
              {BOOKING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={zoneF} onChange={e => setZoneF(e.target.value)} className="px-2 py-1.5 rounded-lg text-xs border border-slate-200 outline-none">
              <option value="all">All zones</option>
              <option value="شمال عمّان">شمال عمّان</option>
              <option value="وسط عمّان">وسط عمّان</option>
            </select>
            <button onClick={() => downloadCsv("bookings.csv", [["ID", "Customer", "Service", "Technician", "Amount", "Status", "Zone", "Date"], ...filtered.map(b => [b.id, b.cust, b.svc, b.tech, b.amount, b.status, b.zone, b.d])])} className="px-3 py-1.5 rounded-lg text-xs border border-slate-200 flex items-center gap-1.5"><Download size={12} /> Export</button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead style={{ background: "#F8FAFC", color: "#475569" }}>
            <tr className="text-left">
              <SortTh label="ID" col="id" sort={sort} setSort={setSort} />
              <th className="px-4 py-3 font-semibold text-xs uppercase">Customer</th>
              <th className="px-4 py-3 font-semibold text-xs uppercase">Service</th>
              <th className="px-4 py-3 font-semibold text-xs uppercase">Technician</th>
              <SortTh label="Amount" col="amount" sort={sort} setSort={setSort} />
              <th className="px-4 py-3 font-semibold text-xs uppercase">Status</th>
              <th className="px-4 py-3 font-semibold text-xs uppercase">Zone</th>
              <th className="px-4 py-3 font-semibold text-xs uppercase">Date</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-sm">No bookings match these filters.</td></tr>
            ) : pageRows.map(b => (
              <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setDetail(b)}>
                <td className="px-4 py-3 font-mono font-semibold">{b.id}</td>
                <td className="px-4 py-3">{b.cust}</td>
                <td className="px-4 py-3"><div className="flex items-center gap-1.5"><ServiceIcon id={b.svc as any} size={14} /><span>{SERVICES.find(s => s.id === b.svc)!.en}</span></div></td>
                <td className="px-4 py-3">{b.tech}</td>
                <td className="px-4 py-3 font-bold">JOD {b.amount}</td>
                <td className="px-4 py-3"><BookingBadge status={b.status} /></td>
                <td className="px-4 py-3 text-slate-500 text-xs">{b.zone}</td>
                <td className="px-4 py-3 text-slate-500">{b.d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination total={filtered.length} page={page} pageSize={pageSize} setPage={setPage} />
      </div>

      {detail && (
        <Drawer title={`Booking ${detail.id}`} onClose={() => setDetail(null)}>
          <div className="flex items-center justify-between">
            <BookingBadge status={detail.status} />
            <span className="font-bold text-lg">JOD {detail.amount}</span>
          </div>
          <div className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">Customer</span><span className="font-semibold">{detail.cust}</span></div>
            <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">Technician</span><span className="font-semibold">{detail.tech}</span></div>
            <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">Service</span><span className="font-semibold">{SERVICES.find(s => s.id === detail.svc)!.en}</span></div>
            <div className="flex justify-between py-1 border-b border-slate-100"><span className="text-slate-500">Zone / district</span><span className="font-semibold">{detail.zone} · {detail.district}</span></div>
          </div>

          <h4 className="font-bold mt-5 mb-2">Event timeline</h4>
          <div className="space-y-3">
            {[["created", "تم إنشاء الحجز", "1:00 م"], ["accepted", "قبِل الفني", "1:03 م"], ["arrived", "وصل الفني", "1:28 م"], ["started", "بدأت الخدمة", "1:30 م"], ["completed", "اكتملت", "2:15 م"]].map(([k, ar, t], i) => (
              <div key={k} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "#E8F1FE" }}><CheckCircle2 size={14} color="#1366D6" /></div>
                <div className="flex-1 text-sm">{ar}</div>
                <span className="text-xs text-slate-400">{t}</span>
              </div>
            ))}
          </div>

          <h4 className="font-bold mt-5 mb-2">Payment</h4>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Service price</span><span>JOD {detail.amount}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Platform fee (20%)</span><span>JOD {(detail.amount * 0.2).toFixed(1)}</span></div>
            <div className="flex justify-between font-bold border-t border-slate-100 pt-1.5"><span>Method</span><span>Apple Pay</span></div>
          </div>

          <h4 className="font-bold mt-5 mb-2">Additional-work items</h4>
          <div className="text-sm text-slate-500">استبدال قاطع كهربائي — JOD 10 · موافق عليها</div>
        </Drawer>
      )}
    </div>
  );
}

/* ─────────────────────────── Guarantees ─────────────────────────── */
function Guarantees() {
  const [tickets, setTickets] = useState([
    { id: "GR-104", cust: "أحمد العلي", svc: "plumb", when: "06/06 9:20 ص", sla: 35, status: "review", scheduled: false },
    { id: "GR-103", cust: "سارة خالد", svc: "ac", when: "05/06 4:10 م", sla: 5, status: "review", scheduled: false },
    { id: "GR-102", cust: "محمد الزعبي", svc: "elec", when: "04/06", sla: 0, status: "approved", scheduled: true },
    { id: "GR-101", cust: "رنا حدّاد", svc: "paint", when: "02/06", sla: 0, status: "rejected", scheduled: false },
  ]);
  const [confirm, setConfirm] = useState<{ id: string; action: "approve" | "reject" } | null>(null);

  const handleDecision = (id: string, action: "approve" | "reject") => {
    setTickets(ts => ts.map(t => t.id === id ? { ...t, status: action === "approve" ? "approved" : "rejected", scheduled: action === "approve" } : t));
    notify(action === "approve" ? "تمت الموافقة — جُدولت زيارة مجانية" : "تم رفض الطلب", "success");
    setConfirm(null);
  };

  return (
    <div className="relative">
      <h1 className="text-2xl font-bold">Guarantee tickets</h1>
      <p className="text-sm text-slate-500 mt-1">SLA: guarantee decision ≤ 2h</p>
      <div className="mt-4 grid grid-cols-2 gap-4">
        {tickets.map(t => (
          <div key={t.id} className="bg-white rounded-2xl border border-slate-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono font-bold">{t.id}</div>
                <div className="text-xs text-slate-500">{t.cust} · {t.when}</div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{
                background: t.status === "approved" ? "#DCFCE7" : t.status === "rejected" ? "#FEE2E2" : "#FEF3C7",
                color: t.status === "approved" ? "#15803D" : t.status === "rejected" ? "#B91C1C" : "#B45309",
              }}>{t.status}</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <ServiceIcon id={t.svc as any} size={18} />
              <span className="text-sm">{SERVICES.find(s => s.id === t.svc)!.en}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {[1, 2].map(i => <button key={i} onClick={() => notify("Opening photo…")} className="aspect-square rounded-lg bg-slate-100 flex items-center justify-center text-2xl hover:bg-slate-200">🖼️</button>)}
              <button onClick={() => notify("Playing video…")} className="aspect-square rounded-lg bg-slate-900 flex items-center justify-center"><PlayCircle size={24} color="#FFF" /></button>
            </div>
            {t.status === "review" && (
              <>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-slate-500">SLA (2h)</span>
                  <span className={t.sla < 15 ? "font-bold" : "font-semibold"} style={{ color: t.sla < 15 ? "#B91C1C" : "#475569" }}>{t.sla} min left</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${(t.sla / 120) * 100}%`, background: t.sla < 15 ? "#E5484D" : "#1366D6" }} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => setConfirm({ id: t.id, action: "approve" })} className="h-9 rounded-lg text-sm font-semibold" style={{ background: "#1FAA59", color: "#FFF" }}>Approve</button>
                  <button onClick={() => setConfirm({ id: t.id, action: "reject" })} className="h-9 rounded-lg text-sm font-semibold border border-slate-200">Reject</button>
                </div>
              </>
            )}
            {t.status === "approved" && (
              <button onClick={() => { setTickets(ts => ts.map(x => x.id === t.id ? { ...x, scheduled: true } : x)); notify("زيارة مجانية مجدولة", "success"); }} className="mt-3 w-full h-9 rounded-lg text-sm font-semibold border border-slate-200 flex items-center justify-center gap-2"><CheckCircle2 size={16} /> {t.scheduled ? "Free visit scheduled ✓" : "Schedule free visit"}</button>
            )}
          </div>
        ))}
      </div>

      {confirm && (
        <AdminConfirm
          title={confirm.action === "approve" ? "Approve guarantee claim?" : "Reject guarantee claim?"}
          body={confirm.action === "approve" ? `This will approve ${confirm.id} and schedule a free revisit. The customer will be notified.` : `This will reject ${confirm.id}. The customer will be notified of the decision.`}
          confirmLabel={confirm.action === "approve" ? "Approve" : "Reject"}
          variant={confirm.action === "reject" ? "destructive" : "primary"}
          onConfirm={() => handleDecision(confirm.id, confirm.action)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── Video pre-check quotes ─────────────────────────── */
function Quotes() {
  const [quotes, setQuotes] = useState([
    { id: "VQ-31", cust: "أحمد العلي", svc: "ac", desc: "الوحدة لا تبرّد", status: "pending", price: 0, booking: "" },
    { id: "VQ-30", cust: "سارة خالد", svc: "plumb", desc: "تسريب تحت المغسلة", status: "pending", price: 0, booking: "" },
    { id: "VQ-29", cust: "محمد الزعبي", svc: "elec", desc: "قاطع يفصل باستمرار", status: "quoted", price: 45, booking: "" },
    { id: "VQ-28", cust: "رنا حدّاد", svc: "ac", desc: "صوت عالٍ من المكيّف", status: "accepted", price: 40, booking: "FX-20604" },
  ]);
  const [tab, setTab] = useState(0);
  const [priceModal, setPriceModal] = useState<{ id: string; price: string } | null>(null);
  const statusFilter = ["pending", "quoted", "accepted"][tab];
  const rows = quotes.filter(q => q.status === statusFilter);

  const applyPrice = () => {
    if (!priceModal) return;
    const p = parseInt(priceModal.price, 10);
    if (!p || p <= 0) { notify("Enter a valid price", "error"); return; }
    setQuotes(qs => qs.map(q => q.id === priceModal.id ? { ...q, status: "quoted", price: p } : q));
    notify(`تم التسعير: ${priceModal.id} — ${p} دينار`, "success");
    setPriceModal(null);
  };

  return (
    <div className="relative">
      <h1 className="text-2xl font-bold">Video pre-check quotes</h1>
      <div className="mt-4 flex gap-2">
        {["Pending", "Quoted", "Accepted"].map((t, i) => (
          <button key={t} onClick={() => setTab(i)} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: tab === i ? "#1366D6" : "#FFF", color: tab === i ? "#FFF" : "#475569", border: "1px solid " + (tab === i ? "#1366D6" : "#E2E8F0") }}>{t} ({quotes.filter(q => q.status === ["pending", "quoted", "accepted"][i]).length})</button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        {rows.length === 0 ? (
          <div className="col-span-2 py-12 text-center text-slate-400 text-sm">لا توجد طلبات تسعير بعد</div>
        ) : rows.map(q => (
          <div key={q.id} className="bg-white rounded-2xl border border-slate-100 p-5">
            <div className="flex items-center justify-between">
              <div><div className="font-mono font-bold">{q.id}</div><div className="text-xs text-slate-500">{q.cust}</div></div>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: q.status === "pending" ? "#FEF3C7" : q.status === "quoted" ? "#DCFCE7" : "#DBEAFE", color: q.status === "pending" ? "#B45309" : q.status === "quoted" ? "#15803D" : "#1366D6" }}>{q.status === "pending" ? "بانتظار التسعير" : q.status === "quoted" ? "مُسعّر" : "مقبول"}</span>
            </div>
            <div className="mt-3 flex items-center gap-2"><ServiceIcon id={q.svc as any} size={18} /><span className="text-sm">{SERVICES.find(s => s.id === q.svc)!.en} — {q.desc}</span></div>
            <button onClick={() => notify("Playing problem video…")} className="mt-3 w-full aspect-video rounded-lg bg-slate-900 flex items-center justify-center"><PlayCircle size={40} color="#FFF" /></button>
            {q.status === "pending" && <button onClick={() => setPriceModal({ id: q.id, price: "" })} className="mt-3 w-full h-9 rounded-lg text-sm font-semibold text-white" style={{ background: "#1366D6" }}>تسعير</button>}
            {q.status === "quoted" && <div className="mt-3 text-sm font-bold" style={{ color: "#15803D" }}>السعر الثابت: {q.price} دينار</div>}
            {q.status === "accepted" && <div className="mt-3 text-sm">السعر: {q.price} دينار · أصبح حجزاً <span className="font-mono font-bold">{q.booking}</span></div>}
          </div>
        ))}
      </div>

      {priceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl" style={{ width: 360 }}>
            <h3 className="font-bold text-lg">تسعير الطلب {priceModal.id}</h3>
            <label className="text-xs font-semibold text-slate-500 mt-4 block">Firm price (دينار)</label>
            <input autoFocus type="number" value={priceModal.price} onChange={e => setPriceModal({ ...priceModal, price: e.target.value })} onKeyDown={e => { if (e.key === "Enter") applyPrice(); }} className="mt-1.5 w-full h-11 rounded-lg border border-slate-200 px-3 outline-none text-sm" placeholder="45" />
            <div className="mt-5 flex gap-2 justify-end">
              <button onClick={() => setPriceModal(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold">Cancel</button>
              <button onClick={applyPrice} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: "#1366D6" }}>Set price</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Subscriptions ─────────────────────────── */
function Subscriptions() {
  const members = [
    { name: "رنا حدّاد", status: "active", renew: "08/07/2026", saved: 18 },
    { name: "أحمد العلي", status: "active", renew: "12/07/2026", saved: 24 },
    { name: "سارة خالد", status: "past_due", renew: "01/07/2026", saved: 9 },
    { name: "محمد الزعبي", status: "active", renew: "20/07/2026", saved: 30 },
    { name: "يوسف العمري", status: "cancelled", renew: "—", saved: 0 },
  ];
  const active = members.filter(m => m.status === "active").length;
  const pastDue = members.filter(m => m.status === "past_due").length;
  const statusChip = (s: string) => {
    const map: Record<string, [string, string, string]> = { active: ["فعّال", "#DCFCE7", "#15803D"], past_due: ["متأخر", "#FEF3C7", "#B45309"], cancelled: ["ملغى", "#E2E8F0", "#475569"], expired: ["منتهٍ", "#E2E8F0", "#475569"] };
    const [ar, bg, fg] = map[s];
    return <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: bg, color: fg }}>{ar}</span>;
  };
  return (
    <div>
      <h1 className="text-2xl font-bold">Subscriptions — خطة الحماية</h1>
      <div className="grid grid-cols-3 gap-3 mt-4">
        <KPI label="Active members" value={String(active)} icon={<Star size={18} />} color="#1FAA59" />
        <KPI label="Past due" value={String(pastDue)} icon={<AlertCircle size={18} />} color="#F5A623" />
        <KPI label="MRR (5 JOD/mo)" value={`JOD ${active * 5}`} icon={<DollarSign size={18} />} color="#1366D6" />
      </div>
      <div className="mt-4 bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "#F8FAFC", color: "#475569" }}>
            <tr className="text-left">{["Member", "Status", "Renews", "Saved this month"].map(h => <th key={h} className="px-4 py-3 font-semibold text-xs uppercase">{h}</th>)}</tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.name} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3"><div className="flex items-center gap-2"><Avatar name={m.name} size={32} /><span className="font-semibold">{m.name}</span></div></td>
                <td className="px-4 py-3">{statusChip(m.status)}</td>
                <td className="px-4 py-3 text-slate-500">{m.renew}</td>
                <td className="px-4 py-3 font-bold">JOD {m.saved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────── Support & complaints ─────────────────────────── */
const MACROS = [
  "مرحباً، شكراً لتواصلك. كيف يمكنني مساعدتك؟",
  "الفني خالد على بُعد 5 دقائق ويمكنك تتبّعه على الخريطة.",
  "تم إصدار المبلغ المسترد، وسيصل خلال 3–5 أيام عمل.",
  "نعتذر عن الإزعاج، سنعالج الأمر فوراً.",
];
const COMPLAINT_CATS = ["جودة", "تأخير", "تسعير", "سلوك", "سلامة", "أخرى"];

function SupportInbox() {
  const convos = [
    { name: "أحمد العلي", msg: "متى يصل الفني؟", unread: true, time: "2m", cat: "تأخير" },
    { name: "سارة خالد", msg: "كيف أسترد المبلغ؟", unread: true, time: "8m", cat: "تسعير" },
    { name: "محمد الزعبي", msg: "شكراً لمساعدتكم", unread: false, time: "1h", cat: "أخرى" },
    { name: "رنا حدّاد", msg: "هل يمكن إعادة الجدولة؟", unread: false, time: "3h", cat: "جودة" },
  ];
  const [active, setActive] = useState(0);
  const [cat, setCat] = useState(convos[0].cat);
  const [refund, setRefund] = useState(false);
  const [reply, setReply] = useState("");
  const [showMacros, setShowMacros] = useState(false);

  const send = () => { if (!reply.trim()) return; notify("تم إرسال الرد", "success"); setReply(""); };

  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Support &amp; complaints</h1>
        <div className="text-xs text-slate-500">SLA: first response ≤ 5 min · guarantee decision ≤ 2h</div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4" style={{ height: 560 }}>
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100"><h3 className="font-bold text-sm">Inbox · 12 open</h3></div>
          <div className="flex-1 overflow-y-auto">
            {convos.map((c, i) => (
              <button key={i} onClick={() => { setActive(i); setCat(c.cat); }} className="w-full px-4 py-3 flex items-center gap-2 border-b border-slate-100 hover:bg-slate-50 text-left" style={{ background: i === active ? "#E8F1FE" : "#FFF" }}>
                <Avatar name={c.name} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between"><span className="font-bold text-sm">{c.name}</span><span className="text-xs text-slate-500">{c.time}</span></div>
                  <div className="text-xs text-slate-500 truncate mt-0.5">{c.msg}</div>
                </div>
                {c.unread && <span className="w-2 h-2 rounded-full" style={{ background: "#1366D6" }} />}
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-2 bg-white rounded-2xl border border-slate-100 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Avatar name={convos[active].name} size={32} />
            <div><div className="font-bold text-sm">{convos[active].name}</div><div className="text-xs text-slate-500">Booking #FX-20603 · Customer</div></div>
            <div className="flex-1" />
            <select value={cat} onChange={e => { setCat(e.target.value); notify(`Categorized: ${e.target.value}`); }} className="px-2 py-1.5 rounded-lg text-xs border border-slate-200 outline-none">
              {COMPLAINT_CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => notify("Escalated to ops lead", "success")} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200">Escalate</button>
            <button onClick={() => setRefund(true)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "#F5A623" }}>Refund</button>
            <button onClick={() => notify("تم حل المحادثة", "success")} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: "#1FAA59" }}>Resolve</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: "#F8FAFC" }}>
            <div className="flex gap-2 items-end">
              <Avatar name={convos[active].name} size={28} />
              <div className="max-w-xs rounded-2xl rounded-bl-sm bg-white p-3 text-sm border border-slate-100">السلام عليكم، {convos[active].msg}</div>
            </div>
            <div className="flex gap-2 items-end justify-end">
              <div className="max-w-xs rounded-2xl rounded-br-sm p-3 text-sm" style={{ background: "#1366D6", color: "#FFF" }}>وعليكم السلام. الفني خالد على بُعد 5 دقائق، ويمكنك تتبّعه على الخريطة.</div>
              <Avatar name="Layla" size={28} />
            </div>
          </div>
          <div className="border-t border-slate-100 relative">
            {showMacros && (
              <div className="absolute bottom-14 left-3 right-3 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-10">
                {MACROS.map(m => <button key={m} onClick={() => { setReply(m); setShowMacros(false); }} className="w-full px-3 py-2 text-xs text-right hover:bg-slate-50 truncate" dir="rtl">{m}</button>)}
              </div>
            )}
            <div className="p-3 flex gap-2">
              <button onClick={() => setShowMacros(!showMacros)} className="px-3 rounded-lg text-sm font-semibold border border-slate-200">Macros</button>
              <input value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send(); }} className="flex-1 h-10 rounded-lg border border-slate-200 px-3 outline-none text-sm" placeholder="Type a reply..." dir="rtl" />
              <button onClick={send} className="px-4 rounded-lg text-sm font-semibold" style={{ background: "#1366D6", color: "#FFF" }}>Send</button>
            </div>
          </div>
        </div>
      </div>

      {refund && (
        <AdminConfirm
          title="Process refund?"
          body={`This will refund ${convos[active].name} for booking #FX-20603. The customer will be notified.`}
          confirmLabel="Process refund"
          variant="destructive"
          onConfirm={() => { setRefund(false); notify("تم إصدار المبلغ المسترد", "success"); }}
          onCancel={() => setRefund(false)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── Customers ─────────────────────────── */
type Customer = { n: string; p: string; b: number; s: number; st: string; j: string; credit: number };
function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([
    { n: "أحمد العلي", p: "+962 79 000 0001", b: 12, s: 580, st: "active", j: "12/03/2025", credit: 20 },
    { n: "سارة خالد", p: "+962 78 123 4567", b: 8, s: 320, st: "active", j: "04/04/2025", credit: 0 },
    { n: "محمد الزعبي", p: "+962 79 888 8999", b: 5, s: 210, st: "active", j: "20/05/2025", credit: 5 },
    { n: "رنا حدّاد", p: "+962 77 111 1222", b: 3, s: 105, st: "active", j: "01/01/2026", credit: 0 },
    { n: "يوسف العمري", p: "+962 79 555 5444", b: 1, s: 35, st: "blocked", j: "10/02/2026", credit: 0 },
  ]);
  const [detail, setDetail] = useState<Customer | null>(null);
  const [confirm, setConfirm] = useState<Customer | null>(null);

  const toggleBlock = (c: Customer) => {
    const next = c.st === "active" ? "blocked" : "active";
    setCustomers(cs => cs.map(x => x.n === c.n ? { ...x, st: next } : x));
    notify(next === "blocked" ? `Blocked ${c.n}` : `Unblocked ${c.n}`, "success");
    setConfirm(null);
    setDetail(d => d && d.n === c.n ? { ...d, st: next } : d);
  };

  return (
    <div className="relative">
      <h1 className="text-2xl font-bold">Customers</h1>
      <div className="mt-4 bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead style={{ background: "#F8FAFC", color: "#475569" }}>
            <tr className="text-left">{["Name", "Phone", "Bookings", "Total spent", "Credit", "Status", "Joined"].map(h => <th key={h} className="px-4 py-3 font-semibold text-xs uppercase">{h}</th>)}</tr>
          </thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.n} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setDetail(c)}>
                <td className="px-4 py-3"><div className="flex items-center gap-2"><Avatar name={c.n} size={32} /><span className="font-semibold">{c.n}</span></div></td>
                <td className="px-4 py-3 font-mono text-xs">{c.p}</td>
                <td className="px-4 py-3 font-semibold">{c.b}</td>
                <td className="px-4 py-3 font-bold">JOD {c.s}</td>
                <td className="px-4 py-3">{c.credit > 0 ? <span className="font-semibold" style={{ color: "#15803D" }}>JOD {c.credit}</span> : <span className="text-slate-400">—</span>}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: c.st === "active" ? "#DCFCE7" : "#FEE2E2", color: c.st === "active" ? "#15803D" : "#B91C1C" }}>{c.st}</span></td>
                <td className="px-4 py-3 text-slate-500">{c.j}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <Drawer title="Customer profile" onClose={() => setDetail(null)}>
          <div className="flex items-center gap-3">
            <Avatar name={detail.n} size={56} />
            <div><div className="font-bold text-lg">{detail.n}</div><div className="text-sm text-slate-500 font-mono">{detail.p}</div></div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <OpsStat label="Bookings" value={String(detail.b)} />
            <OpsStat label="Total spent" value={`JOD ${detail.s}`} />
            <OpsStat label="Service credit" value={`JOD ${detail.credit}`} />
          </div>
          <h4 className="font-bold mt-5 mb-2">Booking history</h4>
          <div className="space-y-2">
            {SEED_BOOKINGS.filter(b => b.cust === detail.n).slice(0, 5).map(b => (
              <div key={b.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100">
                <ServiceIcon id={b.svc as any} size={14} />
                <span className="text-sm flex-1">{b.id} · {SERVICES.find(s => s.id === b.svc)!.en}</span>
                <BookingBadge status={b.status} />
              </div>
            ))}
            {SEED_BOOKINGS.filter(b => b.cust === detail.n).length === 0 && <div className="text-xs text-slate-400">لا توجد حجوزات</div>}
          </div>
          <button onClick={() => setConfirm(detail)} className="mt-5 w-full h-10 rounded-lg text-sm font-semibold text-white" style={{ background: detail.st === "active" ? "#E5484D" : "#1FAA59" }}>{detail.st === "active" ? "Block customer" : "Unblock customer"}</button>
        </Drawer>
      )}

      {confirm && (
        <AdminConfirm
          title={confirm.st === "active" ? "Block customer?" : "Unblock customer?"}
          body={`This will ${confirm.st === "active" ? "block" : "unblock"} ${confirm.n}.`}
          confirmLabel={confirm.st === "active" ? "Block" : "Unblock"}
          variant={confirm.st === "active" ? "destructive" : "primary"}
          onConfirm={() => toggleBlock(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── Financials ─────────────────────────── */
function Finance() {
  const monthly = [
    { m: "Jan", rev: 18, fee: 3.6 }, { m: "Feb", rev: 22, fee: 4.4 }, { m: "Mar", rev: 25, fee: 5 },
    { m: "Apr", rev: 31, fee: 6.2 }, { m: "May", rev: 38, fee: 7.6 }, { m: "Jun", rev: 42, fee: 8.4 },
  ];
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Financial reports</h1>
        <div className="flex gap-2">
          <DateRangePicker initial={3} />
          <button onClick={() => downloadCsv("fixly-financials.csv", [["Month", "Revenue (k JOD)", "Platform fee 20% (k JOD)", "Payouts (k JOD)"], ...monthly.map(m => [m.m, m.rev, m.fee, +(m.rev - m.fee).toFixed(1)])])} className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2" style={{ background: "#1FAA59", color: "#FFF" }}><Download size={14} /> Export CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-5">
        <KPI label="Total revenue (6mo)" value="JOD 176k" delta="+18%" icon={<DollarSign size={18} />} color="#1366D6" />
        <KPI label="Platform fees (20%)" value="JOD 35.2k" delta="+18%" icon={<TrendingUp size={18} />} color="#0FB5A6" />
        <KPI label="Technician payouts" value="JOD 140.8k" icon={<Users size={18} />} color="#F5A623" />
      </div>

      <div className="mt-5 bg-white rounded-2xl border border-slate-100 p-5">
        <h3 className="font-bold mb-3">Revenue vs platform fees</h3>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={monthly} key="fin-bar">
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="m" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} unit="k" />
            <Tooltip cursor={false} />
            <Bar dataKey="rev" fill="#1366D6" radius={[6, 6, 0, 0]} name="Revenue (k JOD)" isAnimationActive={false} />
            <Bar dataKey="fee" fill="#0FB5A6" radius={[6, 6, 0, 0]} name="Fee (k JOD)" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 font-bold">Monthly breakdown</div>
        <table className="w-full text-sm">
          <thead style={{ background: "#F8FAFC", color: "#475569" }}>
            <tr className="text-left">{["Month", "Revenue", "Platform fee (20%)", "Technician payouts"].map(h => <th key={h} className="px-4 py-3 font-semibold text-xs uppercase">{h}</th>)}</tr>
          </thead>
          <tbody>
            {monthly.map(m => (
              <tr key={m.m} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold">{m.m}</td>
                <td className="px-4 py-3">JOD {m.rev}k</td>
                <td className="px-4 py-3">JOD {m.fee}k</td>
                <td className="px-4 py-3 font-bold">JOD {(m.rev - m.fee).toFixed(1)}k</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─────────────────────────── Broadcast ─────────────────────────── */
function Broadcast() {
  const [segment, setSegment] = useState(1);
  const [title, setTitle] = useState("عرض خاص: خصم 20% على كل الخدمات");
  const [body, setBody] = useState("استمتع بخصم 20% على جميع خدمات Fixly اليوم فقط. استخدم الرمز SUMMER20.");
  const [confirmSend, setConfirmSend] = useState(false);
  const segCounts = ["8,476 users", "4,238 customers", "4,238 technicians"];
  return (
    <div>
      <h1 className="text-2xl font-bold">Broadcast notifications</h1>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <h3 className="font-bold">Compose</h3>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500">Segment</label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {["All", "Customers", "Technicians"].map((s, i) => (
                  <button key={s} onClick={() => setSegment(i)} className="p-3 rounded-lg border-2 text-center text-sm font-semibold" style={{ borderColor: segment === i ? "#1366D6" : "#E2E8F0", background: segment === i ? "#E8F1FE" : "#FFF" }}>{s}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Title (Arabic)</label>
              <input value={title} onChange={e => setTitle(e.target.value)} className="mt-1.5 w-full h-11 rounded-lg border border-slate-200 px-3 outline-none text-sm" dir="rtl" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Body</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={4} className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 outline-none text-sm" dir="rtl" />
            </div>
            <button onClick={() => { if (!title.trim() || !body.trim()) { notify("Title and body are required", "error"); return; } setConfirmSend(true); }} className="w-full h-11 rounded-lg font-semibold" style={{ background: "#1366D6", color: "#FFF" }}>Send to {segCounts[segment]}</button>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <h3 className="font-bold">Preview</h3>
          <div className="mt-4 mx-auto" style={{ width: 280 }}>
            <div className="rounded-2xl p-4 text-white" style={{ background: "linear-gradient(135deg,#1366D6 0%,#0E4FA8 100%)" }}>
              <div className="flex items-center gap-2 text-xs opacity-80"><div className="w-5 h-5 rounded bg-white/20 flex items-center justify-center">🔧</div> Fixly · الآن</div>
              <div className="font-bold mt-2" dir="rtl">{title || "—"}</div>
              <div className="text-xs mt-1 opacity-90" dir="rtl">{body || "—"}</div>
            </div>
            <div className="mt-3 p-3 rounded-lg bg-slate-100 text-xs text-slate-500">
              <div className="font-semibold text-slate-700 mb-1">Estimated reach</div>
              <div>{segCounts[segment]} · ~92% delivery</div>
            </div>
          </div>
        </div>
      </div>

      {confirmSend && (
        <AdminConfirm
          title="Send broadcast?"
          body={`This will send a push notification to ${segCounts[segment]}. This action cannot be undone.`}
          confirmLabel="Send now"
          onConfirm={() => { setConfirmSend(false); notify(`Broadcast sent to ${segCounts[segment]}`, "success"); }}
          onCancel={() => setConfirmSend(false)}
        />
      )}
    </div>
  );
}
