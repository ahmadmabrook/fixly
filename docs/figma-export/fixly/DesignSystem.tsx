import { SERVICES, ServiceIcon, PriceBadge, StatusBadge, Stars, Avatar, GuaranteePill, Card } from "./shared";
import { Wrench, Zap, BadgeCheck, ShieldCheck, Crown, Medal, Star, Gift, Video, Headphones } from "lucide-react";

/* ---- Brand / App icon mark ---- */
function AppIconMark({ size = 96, gradient = false, mono = false }: { size?: number; gradient?: boolean; mono?: boolean }) {
  const bg = mono ? "#0F172A" : gradient ? "linear-gradient(135deg,#1366D6 0%,#0FB5A6 100%)" : "#1366D6";
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size, borderRadius: size * 0.23, background: bg }}
    >
      <Wrench size={size * 0.42} color="#FFF" strokeWidth={2.4} />
      <Zap size={size * 0.24} color="#F5A623" fill="#F5A623" strokeWidth={0} style={{ position: "absolute", top: size * 0.2, insetInlineEnd: size * 0.22 }} />
    </div>
  );
}

function Swatch({ n, c }: { n: string; c: string }) {
  return (
    <div>
      <div className="aspect-square rounded-xl border border-slate-200" style={{ background: c }} />
      <div className="mt-1.5 text-xs font-semibold">{n}</div>
      <div className="text-[10px] text-slate-500" style={{ fontFamily: "Inter" }}>{c}</div>
    </div>
  );
}

/* Trust badges */
function CertifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: "#E8F1FE", color: "#1366D6", fontSize: 11, fontWeight: 700 }}>
      <BadgeCheck size={13} /> فني معتمد
    </span>
  );
}
function TierChip({ label, color, bg, Icon }: { label: string; color: string; bg: string; Icon: any }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: bg, color, fontSize: 11, fontWeight: 700 }}>
      <Icon size={12} /> {label}
    </span>
  );
}

export default function DesignSystem() {
  return (
    <div dir="rtl" className="w-full overflow-y-auto" style={{ background: "#F6F8FB", maxHeight: 844 }}>
      <div className="max-w-[1100px] mx-auto p-8 space-y-8">
        <header>
          <h1 style={{ fontWeight: 800, fontSize: 32 }}>Fixly · نظام التصميم</h1>
          <p style={{ color: "#475569" }} className="mt-1">المكوّنات الأساسية، الألوان، الطباعة، والهوية المستخدمة عبر التطبيقات الأربعة.</p>
        </header>

        {/* Brand / App icon */}
        <Card className="p-6">
          <h2 style={{ fontWeight: 700, fontSize: 18 }}>الهوية والعلامة · Brand & App icon</h2>
          <div className="mt-4 flex flex-wrap items-end gap-8">
            <div className="text-center">
              <AppIconMark size={112} />
              <div className="mt-2 text-xs font-semibold">iOS · Light (1024)</div>
            </div>
            <div className="text-center">
              <AppIconMark size={112} gradient />
              <div className="mt-2 text-xs font-semibold">Alt · Gradient</div>
            </div>
            <div className="text-center">
              <div className="p-2 rounded-[26px]" style={{ background: "#0B1220" }}><AppIconMark size={96} /></div>
              <div className="mt-2 text-xs font-semibold">iOS · Dark</div>
            </div>
            <div className="text-center">
              <div className="p-2 rounded-[26px]" style={{ background: "#E2E8F0" }}><AppIconMark size={96} mono /></div>
              <div className="mt-2 text-xs font-semibold">Tinted / Mono</div>
            </div>
            <div className="flex items-center gap-3">
              {[64, 40, 24].map(s => <AppIconMark key={s} size={s} />)}
              <div className="text-xs text-slate-500">يبقى واضحاً حتى 24px</div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-6">
            <div className="inline-flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "#1366D6" }}><Wrench size={20} color="#fff" /></div>
              <span style={{ color: "#1366D6", fontWeight: 800, fontSize: 26, letterSpacing: -0.5 }}>Fixly</span>
            </div>
            <span className="text-slate-500" style={{ fontSize: 14 }}>«فني محترف خلال 30 دقيقة»</span>
            {/* splash */}
            <div className="w-40 h-24 rounded-xl flex flex-col items-center justify-center gap-2" style={{ background: "#1366D6" }}>
              <AppIconMark size={40} gradient />
              <span style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>Fixly</span>
            </div>
          </div>
        </Card>

        {/* Colors */}
        <Card className="p-6">
          <h2 style={{ fontWeight: 700, fontSize: 18 }}>الألوان · Colors (Light)</h2>
          <div className="mt-4 grid grid-cols-4 md:grid-cols-8 gap-3">
            {([
              ["Primary", "#1366D6"], ["Primary dark", "#0E4FA8"], ["Primary tint", "#E8F1FE"],
              ["Secondary", "#0FB5A6"], ["Accent", "#F5A623"], ["Success", "#1FAA59"],
              ["Warning", "#F5A623"], ["Error", "#E5484D"], ["Ink", "#0F172A"],
              ["Ink 2", "#475569"], ["Muted", "#94A3B8"], ["Border", "#E2E8F0"],
              ["Background", "#F6F8FB"], ["Surface", "#FFFFFF"], ["Pro violet", "#7C3AED"], ["Elite green", "#15803D"],
            ] as [string, string][]).map(([n, c]) => <Swatch key={n} n={n} c={c} />)}
          </div>
          <h3 className="mt-6" style={{ fontWeight: 600, fontSize: 14, color: "#475569" }}>Dark theme</h3>
          <div className="mt-3 grid grid-cols-4 md:grid-cols-8 gap-3">
            {([["BG", "#0B1220"], ["Surface", "#131C2E"], ["Text", "#E8EEF6"], ["Primary", "#3B82F6"]] as [string, string][]).map(([n, c]) => <Swatch key={n} n={n} c={c} />)}
          </div>
        </Card>

        {/* Typography */}
        <Card className="p-6">
          <h2 style={{ fontWeight: 700, fontSize: 18 }}>الطباعة · Typography</h2>
          <div className="mt-4 space-y-3">
            <div style={{ fontWeight: 700, fontSize: 28 }}>Display 28/700 — فني محترف</div>
            <div style={{ fontWeight: 700, fontSize: 22 }}>H1 22/700 — اطلب الآن خلال 30 دقيقة</div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>H2 18/700 — العنوان الفرعي</div>
            <div style={{ fontSize: 15 }}>Body 15/400 — نص أساسي طبيعي للوصف والمحتوى داخل الشاشات.</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Body strong 15/600 — للعناصر المُبرَزة.</div>
            <div style={{ fontSize: 13, color: "#475569" }}>Caption 13/400 — معلومات ثانوية.</div>
            <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>Tiny 11/500 — Labels & meta</div>
            <div className="text-sm text-slate-500 mt-3" dir="ltr">Latin: <span style={{ fontFamily: "Inter" }}>Inter</span> · Arabic: <span style={{ fontFamily: "Tajawal" }}>Tajawal</span> · Numerals: <span style={{ fontFamily: "Inter" }}>0123456789</span></div>
          </div>
        </Card>

        {/* Layout tokens */}
        <Card className="p-6">
          <h2 style={{ fontWeight: 700, fontSize: 18 }}>الرموز التخطيطية · Layout tokens</h2>
          <div className="mt-4 grid md:grid-cols-2 gap-6">
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: "#475569" }}>Spacing (8pt)</div>
              <div className="flex items-end gap-2">
                {[4, 8, 12, 16, 20, 24, 32, 40].map(s => (
                  <div key={s} className="text-center">
                    <div style={{ width: s, height: s, background: "#1366D6", borderRadius: 3 }} />
                    <div className="text-[10px] mt-1" style={{ fontFamily: "Inter" }}>{s}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold mb-2" style={{ color: "#475569" }}>Radius</div>
              <div className="flex items-end gap-3">
                {([["card", 16], ["btn", 12], ["sheet", 24], ["chip", 999]] as [string, number][]).map(([n, r]) => (
                  <div key={n} className="text-center">
                    <div style={{ width: 44, height: 44, background: "#E8F1FE", border: "1px solid #1366D6", borderRadius: r }} />
                    <div className="text-[10px] mt-1">{n}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Service icons & prices */}
        <Card className="p-6">
          <h2 style={{ fontWeight: 700, fontSize: 18 }}>الخدمات والأسعار · Services & prices</h2>
          <div className="mt-4 grid grid-cols-5 gap-3">
            {SERVICES.map(s => (
              <div key={s.id} className="text-center p-4 rounded-xl border border-slate-100">
                <div className="mx-auto w-fit"><ServiceIcon id={s.id} size={28} /></div>
                <div className="mt-2" style={{ fontWeight: 700, fontSize: 14 }}>{s.ar}</div>
                <div className="mt-2"><PriceBadge amount={s.price} /></div>
              </div>
            ))}
          </div>
        </Card>

        {/* Status badges */}
        <Card className="p-6">
          <h2 style={{ fontWeight: 700, fontSize: 18 }}>شارات الحالة · Status badges</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {(["pending","searching","accepted","technician_arriving","arrived","in_progress","completed","cancelled","disputed","expired"] as const).map(s => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
        </Card>

        {/* Trust & membership badges */}
        <Card className="p-6">
          <h2 style={{ fontWeight: 700, fontSize: 18 }}>شارات الثقة والعضوية · Trust & membership</h2>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <CertifiedBadge />
            <TierChip label="موثّق" color="#1366D6" bg="#E8F1FE" Icon={BadgeCheck} />
            <TierChip label="محترف" color="#7C3AED" bg="#F3E8FF" Icon={Medal} />
            <TierChip label="نخبة" color="#15803D" bg="#DCFCE7" Icon={Crown} />
            <TierChip label="عضو الحماية" color="#B45309" bg="#FEF3C7" Icon={Star} />
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1" style={{ background: "#DCFCE7", color: "#15803D", fontSize: 11, fontWeight: 700 }}><ShieldCheck size={12} /> مؤمّن</span>
          </div>
        </Card>

        {/* Feature icons */}
        <Card className="p-6">
          <h2 style={{ fontWeight: 700, fontSize: 18 }}>أيقونات الميزات · Feature icons</h2>
          <div className="mt-4 flex flex-wrap gap-4">
            {([[Gift, "رصيد/تعويض"], [Video, "فحص مرئي"], [Headphones, "دعم VIP"], [BadgeCheck, "معتمد"], [ShieldCheck, "ضمان"]] as [any, string][]).map(([I, l]) => (
              <div key={l} className="flex flex-col items-center gap-1.5">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#E8F1FE", color: "#1366D6" }}><I size={22} /></div>
                <span className="text-[11px] text-slate-500">{l}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-6">
            <h2 style={{ fontWeight: 700, fontSize: 18 }}>الأزرار · Buttons</h2>
            <div className="mt-4 space-y-2.5">
              <button className="w-full h-[52px] rounded-xl" style={{ background: "#1366D6", color: "#FFF", fontWeight: 600 }}>Primary L</button>
              <button className="w-full h-11 rounded-xl border-2" style={{ borderColor: "#1366D6", color: "#1366D6", fontWeight: 600 }}>Secondary M</button>
              <button className="w-full h-9 rounded-xl" style={{ background: "#F1F5F9", color: "#0F172A", fontWeight: 600, fontSize: 13 }}>Tertiary S</button>
              <button className="w-full h-[52px] rounded-xl" style={{ background: "#E5484D", color: "#FFF", fontWeight: 600 }}>Destructive</button>
              <button disabled className="w-full h-[52px] rounded-xl opacity-50" style={{ background: "#1366D6", color: "#FFF", fontWeight: 600 }}>Disabled</button>
            </div>
          </Card>
          <Card className="p-6">
            <h2 style={{ fontWeight: 700, fontSize: 18 }}>عناصر متنوعة · Misc</h2>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3"><Avatar name="خالد المومني" verified /><div><div style={{ fontWeight: 700 }}>خالد المومني</div><Stars rating={4.9} size={12} /></div></div>
              <div className="flex items-center gap-2"><GuaranteePill /><CertifiedBadge /></div>
              <PriceBadge amount={50} big />
              <div className="flex gap-2">
                <input className="flex-1 h-12 rounded-xl border border-slate-200 px-3 outline-none" placeholder="حقل إدخال" />
                <button className="px-4 rounded-xl" style={{ background: "#1366D6", color: "#FFF", fontWeight: 600 }}>تطبيق</button>
              </div>
              <div className="flex gap-2" dir="ltr">
                {[1,2,3,4,5,6].map(i => <div key={i} className="w-12 h-14 rounded-xl border-2 flex items-center justify-center" style={{ borderColor: i <= 4 ? "#1366D6" : "#E2E8F0", background: i <= 4 ? "#E8F1FE" : "#FFF", fontFamily: "Inter", fontWeight: 700, fontSize: 20 }}>{i <= 4 ? i : ""}</div>)}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
