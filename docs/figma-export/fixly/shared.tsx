import { ReactNode, useState } from "react";
import {
  Zap, Droplets, Snowflake, PaintRoller, Sofa, ShieldCheck, Star, BadgeCheck,
  Wrench, MapPin, Navigation, Plus, Clock, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

export const notify = (msg: string, kind: "info" | "success" | "error" = "info") => {
  if (kind === "success") toast.success(msg);
  else if (kind === "error") toast.error(msg);
  else toast(msg);
};
export const soon = () => notify("قريباً — هذه الميزة في الطريق");

export const SERVICES = [
  { id: "elec",   ar: "كهرباء",       en: "Electricity", price: 50, dur: 45, Icon: Zap,         tint: "#FEF3C7", color: "#D97706" },
  { id: "plumb",  ar: "سباكة",        en: "Plumbing",    price: 40, dur: 60, Icon: Droplets,    tint: "#DBEAFE", color: "#1366D6" },
  { id: "ac",     ar: "تكييف",         en: "Air Conditioning", price: 30, dur: 45, Icon: Snowflake,   tint: "#CFFAFE", color: "#0E7490" },
  { id: "paint",  ar: "دهان",         en: "Painting",    price: 0, dur: 180, Icon: PaintRoller,tint: "#FCE7F3", color: "#BE185D" },
  { id: "furn",   ar: "تركيب أثاث",   en: "Furniture",   price: 35, dur: 60, Icon: Sofa,        tint: "#DCFCE7", color: "#15803D" },
] as const;

export type ServiceId = typeof SERVICES[number]["id"];

export const STATUS = {
  awaiting_payment:     { ar: "بانتظار الدفع",       bg: "#E2E8F0", fg: "#475569" },
  pending:              { ar: "جارٍ البحث عن فني",  bg: "#DBEAFE", fg: "#1366D6" },
  searching:            { ar: "جارٍ البحث عن فني",   bg: "#DBEAFE", fg: "#1366D6" },
  en_route:             { ar: "الفني في الطريق",     bg: "#CCFBF1", fg: "#0F766E" },
  confirmed:            { ar: "تم القبول",           bg: "#DBEAFE", fg: "#1366D6" },
  accepted:             { ar: "تم القبول",           bg: "#DBEAFE", fg: "#1366D6" },
  technician_arriving:  { ar: "الفني في الطريق",     bg: "#CCFBF1", fg: "#0F766E" },
  arrived:              { ar: "الفني وصل",           bg: "#CCFBF1", fg: "#0F766E" },
  in_progress:          { ar: "الخدمة جارية",        bg: "#FEF3C7", fg: "#B45309" },
  completed:            { ar: "مكتملة",              bg: "#DCFCE7", fg: "#15803D" },
  cancelled:            { ar: "ملغاة",               bg: "#FEE2E2", fg: "#B91C1C" },
  disputed:             { ar: "نزاع",                bg: "#FEE2E2", fg: "#B91C1C" },
  expired:              { ar: "منتهية",              bg: "#E2E8F0", fg: "#475569" },
} as const;

export type StatusKey = keyof typeof STATUS;

export function StatusBadge({ status }: { status: StatusKey }) {
  const s = STATUS[status];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1"
      style={{ background: s.bg, color: s.fg, fontSize: 11, fontWeight: 600 }}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: s.fg }} />
      {s.ar}
    </span>
  );
}

export function ServiceIcon({ id, size = 28 }: { id: ServiceId; size?: number }) {
  const s = SERVICES.find(x => x.id === id)!;
  const { Icon } = s;
  return (
    <div
      className="flex items-center justify-center rounded-xl"
      style={{ width: size + 20, height: size + 20, background: s.tint, color: s.color }}
    >
      <Icon size={size} strokeWidth={2} />
    </div>
  );
}

export function PriceBadge({ amount, big = false }: { amount: number; big?: boolean }) {
  return (
    <span
      className="inline-flex items-baseline gap-1 rounded-lg"
      style={{
        background: big ? "transparent" : "#E8F1FE",
        color: "#0E4FA8",
        padding: big ? 0 : "4px 10px",
        fontWeight: 700,
        fontSize: big ? 28 : 14,
      }}
    >
      <span style={{ fontFamily: "Inter" }}>{amount}</span>
      <span style={{ fontSize: big ? 14 : 12, fontWeight: 600 }}>دينار</span>
    </span>
  );
}

export function PhoneFrame({ children, dir = "rtl" }: { children: ReactNode; dir?: "rtl" | "ltr" }) {
  return (
    <div className="flex justify-center">
      <div
        dir={dir}
        className="relative shadow-2xl rounded-[40px] overflow-hidden border border-slate-200"
        style={{ width: 390, height: 844, background: "#F6F8FB" }}
      >
        {/* Status bar */}
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 pt-2.5 pb-1.5"
             style={{ background: "transparent", fontSize: 12, fontWeight: 600, color: "#0F172A" }}>
          <span style={{ fontFamily: "Inter" }}>9:41</span>
          <div className="flex items-center gap-1">
            <span style={{ fontSize: 10 }}>●●●</span>
            <span>5G</span>
            <span>🔋</span>
          </div>
        </div>
        <div className="absolute inset-0 pt-7">{children}</div>
      </div>
    </div>
  );
}

export function TopBar({ title, onBack, dir = "rtl", right }: { title: string; onBack?: () => void; dir?: "rtl" | "ltr"; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between h-14 px-4 bg-white border-b border-slate-200">
      <button
        className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center"
        onClick={onBack}
        aria-label="back"
      >
        <span style={{ fontSize: 22, color: "#0F172A" }}>{dir === "rtl" ? "›" : "‹"}</span>
      </button>
      <h2 style={{ fontWeight: 700, fontSize: 17 }}>{title}</h2>
      <div className="w-9">{right}</div>
    </div>
  );
}

export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1" style={{ color: "#F5A623", fontWeight: 600, fontSize: size }}>
      <Star size={size} fill="#F5A623" strokeWidth={0} />
      <span style={{ fontFamily: "Inter", color: "#0F172A" }}>{rating.toFixed(1)}</span>
    </span>
  );
}

export function PrimaryButton({
  children, onClick, disabled, full = true, loading, variant = "primary",
}: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; full?: boolean; loading?: boolean;
  variant?: "primary" | "outline" | "destructive" | "ghost";
}) {
  const styles =
    variant === "primary"
      ? { background: "#1366D6", color: "#FFF" }
      : variant === "outline"
      ? { background: "#FFF", color: "#1366D6", border: "1px solid #1366D6" }
      : variant === "destructive"
      ? { background: "#E5484D", color: "#FFF" }
      : { background: "transparent", color: "#1366D6" };
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${full ? "w-full" : ""} h-[52px] rounded-xl px-5 transition active:scale-[0.98] disabled:opacity-50`}
      style={{ ...styles, fontWeight: 600, fontSize: 15 }}
    >
      {loading ? "..." : children}
    </button>
  );
}

/** Simple map mock — soft, low-saturation, with pins. */
export function MapMock({
  showRoute = false, showTechPin = false, customerLabel = "موقعك", techLabel,
  height = 360,
}: {
  showRoute?: boolean; showTechPin?: boolean; customerLabel?: string; techLabel?: string;
  height?: number;
}) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height, background: "linear-gradient(180deg,#EEF2F7 0%,#E5ECF3 100%)" }}
    >
      {/* fake roads */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 400" preserveAspectRatio="none">
        <g stroke="#FFF" strokeWidth="6" fill="none" opacity="0.9">
          <path d="M-20 80 L420 120" />
          <path d="M-20 220 L420 200" />
          <path d="M-20 320 L420 340" />
          <path d="M80 -20 L60 420" />
          <path d="M220 -20 L260 420" />
          <path d="M340 -20 L320 420" />
        </g>
        <g stroke="#D8E1EA" strokeWidth="2" fill="none">
          <path d="M-20 150 L420 160" />
          <path d="M-20 260 L420 280" />
          <path d="M160 -20 L150 420" />
        </g>
        {/* parks */}
        <rect x="20" y="240" width="90" height="80" rx="8" fill="#DCEBD8" />
        <rect x="280" y="40" width="100" height="70" rx="8" fill="#DCEBD8" />
        {/* route */}
        {showRoute && (
          <path
            d="M310 290 Q 240 240 200 200 T 110 110"
            stroke="#1366D6" strokeWidth="4" fill="none" strokeLinecap="round"
            strokeDasharray="0"
          />
        )}
      </svg>

      {/* destination/customer pin (amber/blue) */}
      <div className="absolute" style={{ left: "26%", top: "22%", transform: "translate(-50%,-100%)" }}>
        <div className="flex flex-col items-center">
          <div className="px-2.5 py-1 rounded-full bg-white shadow-md text-[11px] font-semibold mb-1" style={{ color: "#0F172A" }}>
            {customerLabel}
          </div>
          <MapPin size={28} color="#1366D6" fill="#1366D6" strokeWidth={1.5} stroke="#FFF" />
        </div>
      </div>

      {/* tech pin */}
      {showTechPin && (
        <div className="absolute" style={{ left: "76%", top: "70%", transform: "translate(-50%,-100%)" }}>
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full animate-ping" style={{ background: "#0FB5A6", opacity: 0.3 }} />
              <div className="w-11 h-11 rounded-full border-[3px] border-white shadow-lg flex items-center justify-center" style={{ background: "#0FB5A6" }}>
                <Wrench size={20} color="#FFF" />
              </div>
            </div>
            {techLabel && (
              <div className="mt-1 px-2 py-0.5 rounded-full bg-white shadow text-[11px] font-semibold" style={{ color: "#0F766E" }}>{techLabel}</div>
            )}
          </div>
        </div>
      )}

      {/* recenter button */}
      <button onClick={() => notify("تم تحديد موقعك")} aria-label="recenter map" className="absolute bottom-4 left-4 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center">
        <Navigation size={18} color="#1366D6" />
      </button>
    </div>
  );
}

export function Avatar({ name, size = 40, verified = false }: { name: string; size?: number; verified?: boolean }) {
  const initials = name.split(" ").map(p => p[0]).slice(0, 2).join("");
  const hue = (name.charCodeAt(0) * 37) % 360;
  return (
    <div className="relative shrink-0">
      <div
        className="rounded-full flex items-center justify-center font-bold text-white"
        style={{ width: size, height: size, background: `hsl(${hue} 50% 55%)`, fontSize: size * 0.4 }}
      >
        {initials}
      </div>
      {verified && (
        <div className="absolute -bottom-0.5 -end-0.5 bg-white rounded-full">
          <BadgeCheck size={size * 0.4} color="#1366D6" fill="#fff" />
        </div>
      )}
    </div>
  );
}

export function Card({ children, className = "", style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`bg-white rounded-2xl ${className}`}
      style={{
        boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Section({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="px-5 mt-5">
      {(title || action) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h3 style={{ fontWeight: 700, fontSize: 16 }}>{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function GuaranteePill() {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "#DCFCE7", color: "#15803D", fontSize: 11, fontWeight: 600 }}>
      <ShieldCheck size={12} />
      ضمان 30 يوم
    </div>
  );
}

export function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-1 rounded-full transition-all"
          style={{
            width: i === step ? 24 : 8,
            background: i <= step ? "#1366D6" : "#E2E8F0",
          }}
        />
      ))}
    </div>
  );
}

export const LOGO = (
  <div className="inline-flex items-center gap-2">
    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#1366D6" }}>
      <Wrench size={18} color="#fff" />
    </div>
    <span style={{ color: "#1366D6", fontWeight: 800, fontSize: 22, letterSpacing: -0.5 }}>Fixly</span>
  </div>
);

export function FullCTA({ children, onClick, variant = "primary", icon }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "outline" | "destructive"; icon?: ReactNode }) {
  return (
    <div className="absolute bottom-0 inset-x-0 px-5 pt-3 pb-6 bg-white border-t border-slate-100">
      <PrimaryButton onClick={onClick} variant={variant}>
        <span className="inline-flex items-center justify-center gap-2">{icon}{children}</span>
      </PrimaryButton>
    </div>
  );
}

export function InlineRow({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span style={{ color: "#475569", fontSize: 14 }}>{label}</span>
      <span style={{ color: "#0F172A", fontWeight: strong ? 700 : 500, fontSize: strong ? 16 : 14 }}>{value}</span>
    </div>
  );
}

export { Clock, Plus };

export function FaqAccordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Card className="overflow-hidden">
      {items.map((item, i) => (
        <div key={i} className="border-b last:border-0 border-slate-100">
          <button onClick={() => setOpen(open === i ? null : i)} className="w-full px-4 py-3.5 flex items-center text-start gap-2" aria-expanded={open === i}>
            <span className="flex-1" style={{ fontSize: 14, fontWeight: 600 }}>{item.q}</span>
            {open === i ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />}
          </button>
          {open === i && (
            <div className="px-4 pb-3.5" style={{ color: "#475569", fontSize: 13 }}>{item.a}</div>
          )}
        </div>
      ))}
    </Card>
  );
}

export function ConfirmDialog({
  title, body, confirmLabel = "تأكيد", cancelLabel = "إلغاء",
  variant = "primary", onConfirm, onCancel,
}: {
  title: string; body?: string; confirmLabel?: string; cancelLabel?: string;
  variant?: "primary" | "destructive"; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
      <div className="mx-5 bg-white rounded-2xl p-5 w-full shadow-2xl" style={{ maxWidth: 320 }}>
        <h3 style={{ fontWeight: 700, fontSize: 18, textAlign: "center" }}>{title}</h3>
        {body && <p style={{ color: "#475569", fontSize: 14, textAlign: "center", marginTop: 8 }}>{body}</p>}
        <div className="mt-5 space-y-2">
          <PrimaryButton variant={variant === "destructive" ? "destructive" : "primary"} onClick={onConfirm}>{confirmLabel}</PrimaryButton>
          <PrimaryButton variant="ghost" onClick={onCancel}>{cancelLabel}</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
