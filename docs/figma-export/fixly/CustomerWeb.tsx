import { useState, ReactNode } from "react";
import {
  Search, MapPin, ShieldCheck, Clock, CreditCard, ChevronLeft,
  Headphones, Menu, BadgeCheck, Star, Video, Gift, Wallet, Phone,
  MessageSquare, Flag, ListChecks, Plus, Check, X, WifiOff,
  Inbox, FileText, MapPinned, CheckCircle2, Loader2,
} from "lucide-react";
import {
  SERVICES, ServiceIcon, PriceBadge, Card, Stars, Avatar, MapMock, StatusBadge,
  GuaranteePill, InlineRow, notify, ConfirmDialog, LOGO,
} from "./shared";

type View =
  | "landing" | "login" | "catalog" | "service" | "booking" | "tracking"
  | "account";

type Svc = typeof SERVICES[number];

// ---- Seed data (Jordanian, §15) ----
const TECH = { name: "خالد المومني", rating: 4.9, jobs: 320, vehicle: "هيونداي إلنترا · فضي", tier: "محترف", tierColor: "#7C3AED" };
const REVIEWS = [
  { name: "سارة خالد", rating: 5, text: "خدمة ممتازة! وصل الفني خلال 20 دقيقة وحلّ مشكلة التكييف بسرعة." },
  { name: "محمد الزعبي", rating: 4.7, text: "سعر ثابت كما هو معلن وبدون مفاجآت. أنصح بالتطبيق بشدة." },
  { name: "رنا حدّاد", rating: 4.9, text: "الضمان فعلاً حقيقي — أعادوا الفني بدون أي رسوم." },
  { name: "يوسف العمري", rating: 4.8, text: "الفني خالد محترف ومهذّب، أنجز العمل بسرعة ونظافة." },
];
const SOP: Record<string, { inc: string[]; exc: string[] }> = {
  elec:  { inc: ["فحص شامل من فني معتمد", "إصلاح الأعطال الكهربائية", "استبدال المفاتيح والقواطع", "اختبار التشغيل والسلامة"], exc: ["أعمال التمديد الكامل للمبنى", "قطع الغيار النادرة (تُسعّر منفصلة)", "الأعمال خارج الشقة"] },
  plumb: { inc: ["كشف التسريبات", "إصلاح الحنفيات والصمامات", "فك وتركيب السيفون", "اختبار الضغط"], exc: ["تكسير البلاط والجدران", "استبدال الخزانات الكاملة", "شبكات الصرف الرئيسية"] },
  ac:    { inc: ["تنظيف الفلاتر والوحدة الداخلية", "فحص غاز التبريد", "تنظيف مصرف المياه", "اختبار كفاءة التبريد"], exc: ["شحن الغاز (يُسعّر منفصلاً)", "تركيب وحدات جديدة", "تمديدات النحاس"] },
  paint: { inc: ["تجهيز السطح", "طبقتان من الدهان", "حماية الأرضيات والأثاث"], exc: ["أعمال الجبس والديكور", "الترميم الإنشائي"] },
  furn:  { inc: ["تجميع القطعة", "التثبيت على الجدار", "التخلص من مواد التغليف"], exc: ["أعمال النجارة المخصصة", "نقل الأثاث الثقيل بين الطوابق"] },
};
const CALLOUT = 5; // callout/inspection fee (deducted from repair)

// small local helper – section pill button
function TierChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: "#F3E8FF", color: TECH.tierColor, fontSize: 11, fontWeight: 700 }}>
      <Star size={11} fill={TECH.tierColor} strokeWidth={0} /> {TECH.tier}
    </span>
  );
}
function CertifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: "#E8F1FE", color: "#1366D6", fontSize: 11, fontWeight: 700 }}>
      <BadgeCheck size={12} /> فني معتمد
    </span>
  );
}

export default function CustomerWeb() {
  const [view, setView] = useState<View>("landing");
  const [svc, setSvc] = useState<Svc>(SERVICES[0]);
  const [authed, setAuthed] = useState(false);
  const [member, setMember] = useState(false); // Protection member
  const [credit, setCredit] = useState(20);     // wallet balance

  const go = (v: View) => { window.scrollTo?.(0, 0); setView(v); };
  const pick = (s: Svc) => { setSvc(s); go("service"); };
  const requireAuth = (next: View) => { if (authed) go(next); else { notify("سجّل الدخول للمتابعة"); go("login"); } };

  return (
    <div dir="rtl" className="w-full overflow-y-auto" style={{ background: "#F6F8FB", maxHeight: 844 }}>
      <TopNav active={view} go={go} authed={authed} member={member} onLogout={() => { setAuthed(false); notify("تم تسجيل الخروج"); go("landing"); }} />

      {view === "landing" && <Landing onCTA={() => go("catalog")} onPickService={pick} onProtection={() => requireAuth("account")} />}
      {view === "login" && <Login onDone={() => { setAuthed(true); notify("تم تسجيل الدخول بنجاح", "success"); go("landing"); }} />}
      {view === "catalog" && <Catalog onPick={pick} />}
      {view === "service" && <ServicePage svc={svc} onBook={() => requireAuth("booking")} onBack={() => go("catalog")} member={member} />}
      {view === "booking" && (
        <Booking svc={svc} member={member} credit={credit} onBack={() => go("service")}
          onConfirm={() => { setCredit(0); go("tracking"); }} />
      )}
      {view === "tracking" && <Tracking svc={svc} onDone={() => go("account")} onCredit={(n) => setCredit(c => c + n)} />}
      {view === "account" && (
        <Account member={member} credit={credit}
          onSubscribe={() => { setMember(true); notify("تم تفعيل خطة الحماية", "success"); }}
          onCancelSub={() => { setMember(false); notify("سيتم إلغاء الاشتراك في نهاية الفترة"); }} />
      )}

      <Footer go={go} />
    </div>
  );
}

// ---------- Top nav ----------
function TopNav({ active, go, authed, member, onLogout }: { active: string; go: (v: View) => void; authed: boolean; member: boolean; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const links: [View, string][] = [["landing", "الرئيسية"], ["catalog", "الخدمات"]];
  return (
    <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center gap-6">
        <button onClick={() => go("landing")} aria-label="Fixly الرئيسية">{LOGO}</button>
        <nav className="hidden md:flex items-center gap-6">
          {links.map(([k, l]) => (
            <button key={k} onClick={() => go(k)} style={{ fontSize: 14, fontWeight: 600, color: active === k ? "#1366D6" : "#475569" }}>{l}</button>
          ))}
          {authed && <button onClick={() => go("account")} style={{ fontSize: 14, fontWeight: 600, color: active === "account" ? "#1366D6" : "#475569" }}>حسابي</button>}
        </nav>
        <div className="flex-1" />
        {member && <span className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ background: "#FEF3C7", color: "#B45309", fontSize: 12, fontWeight: 700 }}><Star size={12} fill="#F5A623" strokeWidth={0} /> عضو الحماية</span>}
        <button onClick={() => notify("English variant — coming soon")} className="px-3 py-1.5 rounded-lg" style={{ background: "#F1F5F9", fontSize: 13, fontWeight: 600 }}>EN / العربية</button>
        {authed
          ? <button onClick={onLogout} className="hidden md:block px-4 py-2 rounded-lg" style={{ background: "#F1F5F9", color: "#475569", fontSize: 14, fontWeight: 600 }}>تسجيل خروج</button>
          : <button onClick={() => go("login")} className="hidden md:block px-4 py-2 rounded-lg" style={{ background: "#1366D6", color: "#FFF", fontSize: 14, fontWeight: 600 }}>تسجيل دخول</button>}
        <button onClick={() => setOpen(o => !o)} aria-label="القائمة" className="md:hidden"><Menu size={22} /></button>
      </div>
      {open && (
        <div className="md:hidden border-t border-slate-200 px-6 py-3 flex flex-col gap-3 bg-white">
          {links.map(([k, l]) => <button key={k} onClick={() => { setOpen(false); go(k); }} className="text-start" style={{ fontSize: 15, fontWeight: 600, color: "#475569" }}>{l}</button>)}
          <button onClick={() => { setOpen(false); go(authed ? "account" : "login"); }} className="text-start" style={{ fontSize: 15, fontWeight: 700, color: "#1366D6" }}>{authed ? "حسابي" : "تسجيل دخول"}</button>
        </div>
      )}
    </div>
  );
}

// ---------- Landing ----------
function Landing({ onCTA, onPickService, onProtection }: { onCTA: () => void; onPickService: (s: Svc) => void; onProtection: () => void }) {
  const launch = SERVICES.filter(s => ["elec", "plumb", "ac"].includes(s.id));
  const soon = SERVICES.filter(s => ["paint", "furn"].includes(s.id));
  return (
    <div className="max-w-[1200px] mx-auto px-6">
      {/* Hero */}
      <section className="grid md:grid-cols-2 gap-8 items-center py-16">
        <div>
          <GuaranteePill />
          <h1 className="mt-4" style={{ fontWeight: 800, fontSize: 48, lineHeight: 1.15, color: "#0F172A" }}>
            فني محترف <span style={{ color: "#1366D6" }}>خلال 30 دقيقة</span>
          </h1>
          <p className="mt-4" style={{ fontSize: 17, color: "#475569" }}>كهرباء، سباكة، تكييف — بأسعار ثابتة وضمان 30 يوم. وإن تأخر الفني نُعوّضك تلقائياً.</p>

          <div className="mt-7 p-2 bg-white rounded-2xl flex items-center gap-2" style={{ boxShadow: "0 10px 30px rgba(15,23,42,0.08)" }}>
            <div className="flex-1 flex items-center gap-2 px-3">
              <Search size={18} color="#94A3B8" />
              <input className="flex-1 h-12 outline-none bg-transparent" placeholder="ابحث عن خدمة..." style={{ fontSize: 15 }} onKeyDown={e => { if (e.key === "Enter") onCTA(); }} />
            </div>
            <div className="hidden sm:flex items-center gap-1 px-3 border-r border-slate-200" style={{ color: "#475569", fontSize: 14 }}>
              <MapPin size={16} /> عمّان
            </div>
            <button onClick={onCTA} className="h-12 px-6 rounded-xl active:scale-[0.98] transition" style={{ background: "#1366D6", color: "#FFF", fontWeight: 700 }}>اطلب الآن</button>
          </div>

          <div className="mt-6 flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2"><Stars rating={4.8} /><span style={{ fontSize: 13, color: "#475569" }}>+5,000 تقييم</span></div>
            <div className="flex items-center gap-2" style={{ color: "#475569", fontSize: 13 }}><ShieldCheck size={16} color="#15803D" /> ضمان 30 يوم</div>
            <div className="flex items-center gap-2" style={{ color: "#475569", fontSize: 13 }}><BadgeCheck size={16} color="#1366D6" /> فنيون معتمدون</div>
          </div>
        </div>
        <div className="relative">
          <div className="aspect-[4/5] rounded-3xl overflow-hidden relative" style={{ background: "linear-gradient(135deg,#1366D6 0%,#0FB5A6 100%)" }}>
            <div className="absolute inset-0 flex items-center justify-center opacity-20"><Search size={160} color="#fff" /></div>
            <div className="absolute inset-0 flex items-center justify-center"><MapMock height={999} showRoute showTechPin techLabel="خالد · 5 دقائق" customerLabel="عنوانك" /></div>
            <div className="absolute top-6 right-6 left-6 flex justify-between">
              <Card className="p-3 flex items-center gap-2"><div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#CCFBF1" }}><Clock size={18} color="#0F766E" /></div><div><div style={{ fontSize: 11, color: "#475569" }}>وقت الوصول</div><div style={{ fontWeight: 700, fontSize: 14 }}><span style={{ fontFamily: "Inter" }}>5</span> دقائق</div></div></Card>
              <Card className="p-3 flex items-center gap-2"><Avatar name={TECH.name} size={36} verified /><div><div style={{ fontSize: 11, color: "#475569" }}>الفني</div><div style={{ fontWeight: 700, fontSize: 13 }}>خالد</div></div></Card>
            </div>
            <Card className="absolute bottom-6 left-6 right-6 p-4 flex items-center gap-3">
              <ServiceIcon id="elec" size={20} />
              <div className="flex-1">
                <div style={{ fontWeight: 700, fontSize: 14 }}>كهرباء — سعر ثابت</div>
                <StatusBadge status="technician_arriving" />
              </div>
              <PriceBadge amount={50} />
            </Card>
          </div>
        </div>
      </section>

      {/* Value props — 4 pillars + support */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4 pb-16">
        {[
          { i: <BadgeCheck size={26} color="#1366D6" />, t: "فنيون معتمدون", b: "Fixly Certified — موثّقون قبل الوصول" },
          { i: <CreditCard size={26} color="#0FB5A6" />, t: "سعر ثابت", b: "بدون مفاجآت أو خفايا" },
          { i: <ShieldCheck size={26} color="#15803D" />, t: "ضمان 30 يوم", b: "إصلاح مجاني أو استرداد" },
          { i: <Clock size={26} color="#F5A623" />, t: "30 دقيقة", b: "وإن تأخر الفني نُعوّضك" },
          { i: <Headphones size={26} color="#7C3AED" />, t: "دعم 24/7", b: "بالعربية وعلى مدار الساعة" },
        ].map(v => (
          <Card key={v.t} className="p-5">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#F1F5F9" }}>{v.i}</div>
            <div className="mt-3" style={{ fontWeight: 700, fontSize: 16 }}>{v.t}</div>
            <div style={{ color: "#475569", fontSize: 13 }} className="mt-1">{v.b}</div>
          </Card>
        ))}
      </section>

      {/* Services + prices */}
      <section className="pb-16">
        <h2 style={{ fontWeight: 800, fontSize: 32 }}>الخدمات وأسعارها</h2>
        <p style={{ color: "#475569", fontSize: 15 }} className="mt-1">أسعار ثابتة وشفافة — تعرفها قبل الحجز</p>
        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4">
          {launch.map(s => (
            <button key={s.id} onClick={() => onPickService(s)} className="text-start">
              <Card className="p-5 hover:-translate-y-0.5 transition">
                <ServiceIcon id={s.id} size={28} />
                <div className="mt-4" style={{ fontWeight: 700, fontSize: 17 }}>{s.ar}</div>
                <div className="mt-1" style={{ color: "#94A3B8", fontSize: 12 }}>المدة: <span style={{ fontFamily: "Inter" }}>{s.dur}</span> دقيقة</div>
                <div className="mt-3"><PriceBadge amount={s.price} /></div>
              </Card>
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-2 gap-4">
          {soon.map(s => (
            <button key={s.id} onClick={() => notify("قريباً — هذه الخدمة في الطريق")} className="text-start">
              <Card className="p-5 opacity-70 relative">
                <span className="absolute top-4 left-4 px-2 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#B45309", fontSize: 11, fontWeight: 700 }}>قريباً</span>
                <ServiceIcon id={s.id} size={28} />
                <div className="mt-4" style={{ fontWeight: 700, fontSize: 17 }}>{s.ar}</div>
                <div className="mt-3"><PriceBadge amount={s.price} /></div>
              </Card>
            </button>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="pb-16">
        <h2 style={{ fontWeight: 800, fontSize: 32 }}>كيف يعمل التطبيق؟</h2>
        <div className="mt-6 grid md:grid-cols-3 gap-4">
          {[
            { n: 1, t: "اختر الخدمة", b: "حدد ما تحتاج من القائمة وشاهد السعر الثابت." },
            { n: 2, t: "حدد الموقع والدفع", b: "ضع الدبوس على عنوانك واختر طريقة دفع آمنة." },
            { n: 3, t: "تتبّع الفني", b: "تابع الفني المعتمد مباشرة على الخريطة حتى وصوله." },
          ].map(s => (
            <Card key={s.n} className="p-6">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#1366D6", color: "#FFF", fontFamily: "Inter", fontWeight: 800 }}>{s.n}</div>
              <div className="mt-4" style={{ fontWeight: 700, fontSize: 18 }}>{s.t}</div>
              <div style={{ color: "#475569", fontSize: 14 }} className="mt-1.5">{s.b}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* Protection plan */}
      <section className="pb-16">
        <Card className="p-8 overflow-hidden relative" style={{ background: "linear-gradient(120deg,#0E4FA8 0%,#1366D6 60%,#0FB5A6 100%)" }}>
          <div className="grid md:grid-cols-2 gap-6 items-center">
            <div>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.2)", color: "#FFF", fontSize: 12, fontWeight: 700 }}><Star size={12} fill="#F5A623" strokeWidth={0} /> خطة الحماية</span>
              <h2 className="mt-3" style={{ fontWeight: 800, fontSize: 30, color: "#FFF" }}>اشترك ووفّر على كل خدمة</h2>
              <div className="mt-2" style={{ color: "#DBEAFE", fontSize: 15 }}><span style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 22, color: "#FFF" }}>5</span> دنانير/شهر</div>
              <button onClick={onProtection} className="mt-5 px-6 h-12 rounded-xl active:scale-[0.98] transition" style={{ background: "#FFF", color: "#1366D6", fontWeight: 700 }}>اشترك الآن</button>
            </div>
            <div className="grid gap-2.5">
              {["أولوية خلال 30 دقيقة", "خصم 15% على كل خدمة", "ضمان ممتد 90 يوم", "فحص مجاني كل 3 أشهر", "دعم VIP"].map(b => (
                <div key={b} className="flex items-center gap-2" style={{ color: "#FFF", fontSize: 15 }}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.2)" }}><Check size={14} color="#FFF" /></span>{b}
                </div>
              ))}
            </div>
          </div>
        </Card>
      </section>

      {/* Reviews */}
      <section className="pb-16">
        <div className="flex items-end justify-between">
          <h2 style={{ fontWeight: 800, fontSize: 32 }}>آراء العملاء</h2>
          <Stars rating={4.8} size={18} />
        </div>
        <div className="mt-6 grid md:grid-cols-4 gap-4">
          {REVIEWS.map(r => (
            <Card key={r.name} className="p-5">
              <div className="flex items-center justify-between">
                <Stars rating={r.rating} />
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "#DCFCE7", color: "#15803D", fontSize: 10, fontWeight: 700 }}><BadgeCheck size={11} /> تقييم موثّق</span>
              </div>
              <p style={{ fontSize: 14 }} className="mt-3">«{r.text}»</p>
              <div className="mt-4 flex items-center gap-2">
                <Avatar name={r.name} size={32} />
                <span style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</span>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------- Login (phone + OTP) ----------
function Login({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submitPhone = () => {
    if (phone.replace(/\s/g, "").length < 9) { setErr("أدخل رقم هاتف صحيح"); return; }
    setErr(""); setLoading(true);
    setTimeout(() => { setLoading(false); setStep("otp"); notify("تم إرسال الرمز عبر واتساب"); }, 700);
  };
  const submitOtp = () => {
    if (otp.some(d => d === "")) { setErr("الرمز غير صحيح."); return; }
    setErr(""); setLoading(true);
    setTimeout(() => { setLoading(false); onDone(); }, 700);
  };

  return (
    <div className="max-w-[420px] mx-auto px-6 py-16">
      <Card className="p-8">
        <div className="flex justify-center">{LOGO}</div>
        {step === "phone" ? (
          <>
            <h1 className="mt-6 text-center" style={{ fontWeight: 800, fontSize: 24 }}>أدخل رقم هاتفك</h1>
            <p className="mt-1 text-center" style={{ color: "#475569", fontSize: 14 }}>سنرسل لك رمز التحقق عبر واتساب</p>
            <div className="mt-6 flex items-center gap-2 border border-slate-200 rounded-xl px-3 h-[52px]" dir="ltr">
              <span style={{ fontFamily: "Inter", fontWeight: 700, color: "#475569" }}>+962</span>
              <div className="w-px h-6 bg-slate-200" />
              <input value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d ]/g, ""))} inputMode="numeric" placeholder="79 000 0000" className="flex-1 outline-none bg-transparent" style={{ fontFamily: "Inter", fontSize: 16 }} />
            </div>
            {err && <p className="mt-2" style={{ color: "#E5484D", fontSize: 13 }}>{err}</p>}
            <button onClick={submitPhone} disabled={loading} className="mt-5 w-full h-[52px] rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition" style={{ background: "#1366D6", color: "#FFF", fontWeight: 700 }}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : "متابعة"}
            </button>
            <p className="mt-4 text-center" style={{ color: "#94A3B8", fontSize: 12 }}>بالمتابعة، أنت توافق على الشروط والأحكام وسياسة الخصوصية.</p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-center" style={{ fontWeight: 800, fontSize: 24 }}>أدخل رمز التحقق</h1>
            <p className="mt-1 text-center" style={{ color: "#475569", fontSize: 14 }}>تم الإرسال عبر واتساب إلى +962 {phone}</p>
            <div className="mt-6 flex justify-center gap-2" dir="ltr">
              {otp.map((d, i) => (
                <input key={i} value={d} maxLength={1} inputMode="numeric" aria-label={`رقم ${i + 1}`}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, "");
                    const next = [...otp]; next[i] = v; setOtp(next);
                    if (v && i < 5) (e.target.parentElement?.children[i + 1] as HTMLInputElement)?.focus();
                  }}
                  className="text-center rounded-xl border border-slate-200 outline-none focus:border-[#1366D6]" style={{ width: 48, height: 56, fontFamily: "Inter", fontSize: 22, fontWeight: 700 }} />
              ))}
            </div>
            {err && <p className="mt-2 text-center" style={{ color: "#E5484D", fontSize: 13 }}>{err}</p>}
            <button onClick={submitOtp} disabled={loading} className="mt-5 w-full h-[52px] rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition" style={{ background: "#1366D6", color: "#FFF", fontWeight: 700 }}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : "تأكيد"}
            </button>
            <button onClick={() => notify("تم إرسال رمز جديد عبر واتساب")} className="mt-3 w-full text-center" style={{ color: "#1366D6", fontSize: 13, fontWeight: 600 }}>إعادة إرسال الرمز</button>
          </>
        )}
      </Card>
    </div>
  );
}

// ---------- Catalog ----------
function Catalog({ onPick }: { onPick: (s: Svc) => void }) {
  const soonIds = ["paint", "furn"];
  return (
    <div className="max-w-[1200px] mx-auto px-6 py-10">
      <h1 style={{ fontWeight: 800, fontSize: 32 }}>كل الخدمات</h1>
      <p style={{ color: "#475569", fontSize: 15 }} className="mt-1">اختر خدمة لعرض التفاصيل والسعر الثابت</p>
      <div className="mt-6 grid md:grid-cols-3 gap-4">
        {SERVICES.map(s => {
          const soon = soonIds.includes(s.id);
          return (
            <button key={s.id} onClick={() => soon ? notify("قريباً — هذه الخدمة في الطريق") : onPick(s)} className="text-start">
              <Card className={`p-5 flex items-center gap-4 ${soon ? "opacity-70" : "hover:-translate-y-0.5 transition"}`}>
                <ServiceIcon id={s.id} size={28} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div style={{ fontWeight: 700, fontSize: 17 }}>{s.ar}</div>
                    {soon && <span className="px-2 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#B45309", fontSize: 10, fontWeight: 700 }}>قريباً</span>}
                  </div>
                  <div style={{ color: "#475569", fontSize: 12 }}>المدة: <span style={{ fontFamily: "Inter" }}>{s.dur}</span> دقيقة</div>
                </div>
                <PriceBadge amount={s.price} />
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Service detail ----------
function ServicePage({ svc, onBook, onBack, member }: { svc: Svc; onBook: () => void; onBack: () => void; member: boolean }) {
  const sop = SOP[svc.id];
  return (
    <div className="max-w-[1200px] mx-auto px-6 py-10">
      <button onClick={onBack} className="flex items-center gap-1" style={{ color: "#1366D6", fontWeight: 600, fontSize: 14 }}><ChevronLeft size={18} /> رجوع</button>
      <div className="mt-4 grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-5">
          <div className="flex items-center gap-4">
            <ServiceIcon id={svc.id} size={32} />
            <div>
              <h1 style={{ fontWeight: 800, fontSize: 32 }}>{svc.ar}</h1>
              <div style={{ color: "#475569", fontSize: 14 }} className="mt-1">المدة المتوقعة: <span style={{ fontFamily: "Inter" }}>{svc.dur}</span> دقيقة</div>
            </div>
          </div>

          <Card className="p-6">
            <h3 style={{ fontWeight: 700, fontSize: 17 }}>يشمل السعر</h3>
            <ul className="mt-3 grid sm:grid-cols-2 gap-2.5">
              {sop.inc.map(t => (
                <li key={t} className="flex items-start gap-2" style={{ fontSize: 14 }}><Check size={18} color="#15803D" className="shrink-0 mt-0.5" /> {t}</li>
              ))}
            </ul>
            <div className="my-4 h-px bg-slate-100" />
            <h3 style={{ fontWeight: 700, fontSize: 17 }}>لا يشمل</h3>
            <ul className="mt-3 grid sm:grid-cols-2 gap-2.5">
              {sop.exc.map(t => (
                <li key={t} className="flex items-start gap-2" style={{ fontSize: 14, color: "#475569" }}><X size={18} color="#E5484D" className="shrink-0 mt-0.5" /> {t}</li>
              ))}
            </ul>
          </Card>

          <div className="p-4 rounded-xl flex items-start gap-3" style={{ background: "#FEF9EE", border: "1px solid #FDE9C8" }}>
            <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#FEF3C7" }}><FileText size={16} color="#B45309" /></span>
            <div style={{ fontSize: 13, color: "#7A5A18" }}>رسوم كشف <span style={{ fontFamily: "Inter", fontWeight: 700 }}>{CALLOUT}</span> دنانير تُخصم من قيمة الإصلاح.</div>
          </div>

          <Card className="p-5 flex items-center gap-4">
            <span className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "#E8F1FE" }}><Video size={20} color="#1366D6" /></span>
            <div className="flex-1">
              <div style={{ fontWeight: 700, fontSize: 15 }}>غير متأكد من المشكلة؟</div>
              <div style={{ color: "#475569", fontSize: 13 }}>فحص مرئي؟ احصل على سعر ثابت قبل الحجز.</div>
            </div>
            <button onClick={() => notify("تم إرسال طلب التسعير")} className="px-4 h-10 rounded-lg" style={{ background: "#E8F1FE", color: "#1366D6", fontWeight: 700, fontSize: 14 }}>طلب تسعير</button>
          </Card>
        </div>

        <Card className="p-6 h-fit sticky top-20">
          <div style={{ color: "#475569", fontSize: 13 }}>السعر الثابت</div>
          <div className="mt-1"><PriceBadge amount={svc.price} big /></div>
          {member && <div className="mt-1" style={{ color: "#15803D", fontSize: 13, fontWeight: 700 }}>خصم العضوية −15% مُطبّق عند الحجز</div>}
          <div className="my-4 h-px bg-slate-100" />
          <ul className="space-y-2.5" style={{ fontSize: 13, color: "#475569" }}>
            <li className="flex items-center gap-2"><Clock size={15} /> فوراً خلال 30 دقيقة</li>
            <li className="flex items-center gap-2"><BadgeCheck size={15} color="#1366D6" /> فني معتمد Fixly Certified</li>
            <li className="flex items-center gap-2"><ShieldCheck size={15} color="#15803D" /> ضمان {member ? "90" : "30"} يوم مشمول</li>
            <li className="flex items-center gap-2"><CreditCard size={15} /> دفع آمن 100% — لا نقدي</li>
          </ul>
          <button onClick={onBook} className="mt-5 w-full h-12 rounded-xl active:scale-[0.98] transition" style={{ background: "#1366D6", color: "#FFF", fontWeight: 700 }}>اطلب الآن</button>
        </Card>
      </div>
    </div>
  );
}

// ---------- Booking ----------
function Booking({ svc, member, credit, onBack, onConfirm }: { svc: Svc; member: boolean; credit: number; onBack: () => void; onConfirm: () => void }) {
  const [when, setWhen] = useState<"now" | "later">("now");
  const [date, setDate] = useState("");
  const [address, setAddress] = useState("خلدا، شارع وصفي التل، عمارة 12، ط2");
  const [notes, setNotes] = useState("");
  const [pay, setPay] = useState(0);
  const [promo, setPromo] = useState("");
  const [promoOk, setPromoOk] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [failed, setFailed] = useState(false);
  const methods = ["Apple Pay", "Google Pay", "بطاقة"];

  const memberDisc = member ? Math.round(svc.price * 0.15) : 0;
  const promoDisc = promoOk ? 5 : 0;
  const creditApplied = Math.min(credit, Math.max(0, svc.price + CALLOUT - memberDisc - promoDisc));
  const total = Math.max(0, svc.price + CALLOUT - memberDisc - promoDisc - creditApplied);

  const doPay = () => {
    setConfirming(false); setProcessing(true); setFailed(false);
    setTimeout(() => {
      setProcessing(false);
      if (pay === 2 && Math.random() < 0) { setFailed(true); return; } // demo: cards succeed
      notify("تم تأكيد حجزك", "success");
      onConfirm();
    }, 1000);
  };

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-10">
      <button onClick={onBack} className="flex items-center gap-1" style={{ color: "#1366D6", fontWeight: 600, fontSize: 14 }}><ChevronLeft size={18} /> رجوع</button>
      <h1 className="mt-3" style={{ fontWeight: 800, fontSize: 28 }}>إتمام الحجز</h1>
      <div className="mt-4 grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <Card className="p-6">
            <h3 style={{ fontWeight: 700, fontSize: 16 }}>الموعد</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {(["now", "later"] as const).map(k => (
                <button key={k} onClick={() => setWhen(k)} className="p-4 rounded-xl border-2 text-start" style={{ borderColor: when === k ? "#1366D6" : "#E2E8F0", background: when === k ? "#E8F1FE" : "#FFF" }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: when === k ? "#1366D6" : "#0F172A" }}>{k === "now" ? "فوراً" : "حجز لاحقاً"}</div>
                  <div style={{ fontSize: 12, color: "#475569" }}>{k === "now" ? "خلال 30 دقيقة" : "اختر التاريخ"}</div>
                </button>
              ))}
            </div>
            {when === "later" && (
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-3 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontFamily: "Inter", fontSize: 14 }} />
            )}
          </Card>

          <Card className="p-6">
            <h3 style={{ fontWeight: 700, fontSize: 16 }}>الموقع</h3>
            <div className="mt-3 rounded-xl overflow-hidden"><MapMock height={240} customerLabel="عنوانك" /></div>
            <input value={address} onChange={e => setAddress(e.target.value)} className="mt-3 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14 }} placeholder="العنوان" />
            <input value={notes} onChange={e => setNotes(e.target.value)} className="mt-2 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14 }} placeholder="ملاحظات (مثال: رمز البوابة 1234)" />
          </Card>

          <Card className="p-6">
            <h3 style={{ fontWeight: 700, fontSize: 16 }}>الدفع</h3>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {methods.map((m, i) => (
                <button key={m} onClick={() => setPay(i)} className="p-4 rounded-xl border-2 text-center" style={{ borderColor: i === pay ? "#1366D6" : "#E2E8F0", background: i === pay ? "#E8F1FE" : "#FFF", fontWeight: 700, fontSize: 14 }}>{m}</button>
              ))}
            </div>
            <p className="mt-3" style={{ color: "#94A3B8", fontSize: 12 }}>دفع آمن 100% — لا دفع نقدي.</p>
          </Card>
        </div>

        <Card className="p-6 h-fit sticky top-20">
          <h3 style={{ fontWeight: 700, fontSize: 16 }}>ملخص الطلب</h3>
          <div className="mt-4 flex items-center gap-3">
            <ServiceIcon id={svc.id} size={20} />
            <div className="flex-1"><div style={{ fontWeight: 700, fontSize: 14 }}>{svc.ar}</div><div style={{ fontSize: 12, color: "#475569" }}>سعر ثابت</div></div>
            <PriceBadge amount={svc.price} />
          </div>

          {/* promo */}
          <div className="mt-4 flex gap-2">
            <input value={promo} onChange={e => setPromo(e.target.value)} placeholder="أدخل رمز الخصم" className="flex-1 h-10 rounded-lg border border-slate-200 px-3 outline-none" style={{ fontSize: 13 }} />
            <button onClick={() => { if (promo.trim()) { setPromoOk(true); notify("تم تطبيق رمز الخصم", "success"); } }} className="px-3 h-10 rounded-lg" style={{ background: "#E8F1FE", color: "#1366D6", fontWeight: 700, fontSize: 13 }}>تطبيق</button>
          </div>

          <div className="my-4 h-px bg-slate-100" />
          <InlineRow label="سعر الخدمة" value={`${svc.price} دينار`} />
          <InlineRow label="رسوم الكشف" value={`${CALLOUT} دنانير`} />
          {member && <InlineRow label="خصم العضوية −15%" value={<span style={{ color: "#15803D" }}>−{memberDisc} دينار</span>} />}
          {promoOk && <InlineRow label="رمز الخصم" value={<span style={{ color: "#15803D" }}>−{promoDisc} دنانير</span>} />}
          {creditApplied > 0 && <InlineRow label="تم خصم رصيدك" value={<span style={{ color: "#15803D" }}>−{creditApplied} دينار</span>} />}
          <div className="my-2 h-px bg-slate-100" />
          <InlineRow strong label="الإجمالي" value={`${total} دينار`} />
          <p className="mt-3 p-3 rounded-lg" style={{ background: "#E8F1FE", color: "#0E4FA8", fontSize: 12 }}>سيتم حجز المبلغ الآن ويُخصم بعد إتمام الخدمة.</p>
          <p className="mt-2 flex items-center gap-1.5" style={{ color: "#15803D", fontSize: 12 }}><ShieldCheck size={14} /> ضمان {member ? "90" : "30"} يوم مشمول</p>

          {failed && (
            <div className="mt-3 p-3 rounded-lg flex items-center gap-2" style={{ background: "#FEE2E2", color: "#B91C1C", fontSize: 12 }}>
              <WifiOff size={14} /> فشلت عملية الدفع. جرّب وسيلة دفع أخرى.
            </div>
          )}

          <button onClick={() => setConfirming(true)} disabled={processing} className="mt-4 w-full h-12 rounded-xl flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition" style={{ background: "#1366D6", color: "#FFF", fontWeight: 700 }}>
            {processing ? <><Loader2 size={18} className="animate-spin" /> جارٍ فتح صفحة الدفع الآمنة</> : "تأكيد الحجز"}
          </button>
        </Card>
      </div>

      {confirming && (
        <ConfirmDialog
          title="تأكيد الحجز"
          body={`سيتم حجز ${total} دينار عبر ${methods[pay]} وخصمه بعد إتمام الخدمة.`}
          confirmLabel="ادفع الآن"
          onConfirm={doPay}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

// ---------- Live tracking ----------
type Stage = "en_route" | "arrived" | "in_progress" | "completed";
function Tracking({ onDone, onCredit }: { svc: Svc; onDone: () => void; onCredit: (n: number) => void }) {
  const [stage, setStage] = useState<Stage>("en_route");
  const [late, setLate] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [report, setReport] = useState(false);
  const [reviews, setReviews] = useState(false);

  const statusKey = stage === "en_route" ? "technician_arriving" : stage === "arrived" ? "arrived" : stage === "in_progress" ? "in_progress" : "completed";
  const steps: { k: Stage; l: string }[] = [
    { k: "en_route", l: "في الطريق" }, { k: "arrived", l: "وصل" },
    { k: "in_progress", l: "الخدمة جارية" }, { k: "completed", l: "مكتملة" },
  ];
  const curIdx = steps.findIndex(s => s.k === stage);

  const advance = () => {
    if (stage === "en_route") {
      setStage("arrived");
      // simulate late arrival → auto credit
      setLate(true); onCredit(20); notify("تمت إضافة 20 دينار إلى رصيدك (تعويض تأخير)", "success");
    } else if (stage === "arrived") setStage("in_progress");
    else if (stage === "in_progress") setStage("completed");
  };

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-10">
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card className="overflow-hidden">
            <MapMock height={420} showRoute showTechPin techLabel="خالد · 5 دقائق" customerLabel="عنوانك" />
          </Card>
          {late && (
            <div className="mt-4 p-4 rounded-xl flex items-center gap-3" style={{ background: "#FEF9EE", border: "1px solid #FDE9C8" }}>
              <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#FEF3C7" }}><Gift size={18} color="#B45309" /></span>
              <div style={{ fontSize: 14, color: "#7A5A18", fontWeight: 600 }}>تأخر الفني — تم إضافة <span style={{ fontFamily: "Inter" }}>20</span> دينار إلى رصيدك تلقائياً</div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* status + stepper */}
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h3 style={{ fontWeight: 700, fontSize: 16 }}>حالة الطلب</h3>
              <StatusBadge status={statusKey as any} />
            </div>
            <div className="mt-5 space-y-0">
              {steps.map((s, i) => {
                const done = i < curIdx, active = i === curIdx;
                return (
                  <div key={s.k} className="flex items-center gap-3 pb-4 last:pb-0 relative">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10" style={{ background: done || active ? "#1366D6" : "#E2E8F0", color: "#FFF" }}>
                      {done ? <Check size={15} /> : <span style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 12 }}>{i + 1}</span>}
                    </div>
                    {i < steps.length - 1 && <div className="absolute right-[13px] top-7 w-0.5 h-full" style={{ background: done ? "#1366D6" : "#E2E8F0" }} />}
                    <span style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? "#0F172A" : "#94A3B8" }}>{s.l}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Certified tech card */}
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <Avatar name={TECH.name} size={56} verified />
              <div className="flex-1">
                <div style={{ fontWeight: 700, fontSize: 16 }}>{TECH.name}</div>
                <div className="flex items-center gap-2 mt-0.5"><Stars rating={TECH.rating} size={13} /><span style={{ color: "#94A3B8", fontSize: 12 }}>(<span style={{ fontFamily: "Inter" }}>{TECH.jobs}</span> خدمة)</span></div>
                <div className="flex items-center gap-1.5 mt-1.5"><CertifiedBadge /><TierChip /></div>
              </div>
            </div>
            <div className="mt-3" style={{ color: "#475569", fontSize: 13 }}>{TECH.vehicle}</div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => notify("جارٍ الاتصال — 079 0••• ••00")} className="flex-1 h-11 rounded-xl flex items-center justify-center gap-1.5" style={{ background: "#1366D6", color: "#FFF", fontWeight: 700, fontSize: 14 }}><Phone size={16} /> اتصال</button>
              <button onClick={() => notify("فتح المحادثة")} aria-label="رسالة" className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "#E8F1FE", color: "#1366D6" }}><MessageSquare size={18} /></button>
              <button onClick={() => setReport(true)} aria-label="الإبلاغ عن مشكلة" className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "#FEE2E2", color: "#B91C1C" }}><Flag size={18} /></button>
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={() => notify("تشغيل الفيديو التعريفي")} className="flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5" style={{ background: "#F1F5F9", color: "#475569", fontWeight: 600, fontSize: 13 }}><Video size={15} /> مشاهدة الفيديو التعريفي</button>
              <button onClick={() => setReviews(true)} className="flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5" style={{ background: "#F1F5F9", color: "#475569", fontWeight: 600, fontSize: 13 }}><Star size={15} /> عرض التقييمات</button>
            </div>
          </Card>

          {stage !== "completed"
            ? <>
                <button onClick={advance} className="w-full h-12 rounded-xl active:scale-[0.98] transition" style={{ background: "#0FB5A6", color: "#FFF", fontWeight: 700 }}>محاكاة التقدّم →</button>
                <button onClick={() => setCancel(true)} className="w-full h-11 rounded-xl" style={{ background: "#FFF", color: "#E5484D", border: "1px solid #FCA5A5", fontWeight: 700, fontSize: 14 }}>إلغاء الحجز</button>
                <p className="text-center" style={{ color: "#94A3B8", fontSize: 12 }}>الإلغاء مجاني قبل انطلاق الفني؛ قد تُطبّق رسوم إلغاء بعد ذلك.</p>
              </>
            : <Card className="p-5 text-center">
                <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center" style={{ background: "#DCFCE7" }}><CheckCircle2 size={26} color="#15803D" /></div>
                <div className="mt-2" style={{ fontWeight: 700, fontSize: 16 }}>تم إكمال الخدمة</div>
                <p style={{ color: "#475569", fontSize: 13 }} className="mt-1">قيّم تجربتك مع {TECH.name}</p>
                <button onClick={() => { notify("شكراً لتقييمك", "success"); onDone(); }} className="mt-4 w-full h-11 rounded-xl" style={{ background: "#1366D6", color: "#FFF", fontWeight: 700 }}>تقييم وإنهاء</button>
              </Card>}
        </div>
      </div>

      {cancel && (
        <ConfirmDialog title="هل أنت متأكد من إلغاء الحجز؟" body="الإلغاء مجاني قبل انطلاق الفني." variant="destructive" confirmLabel="تأكيد الإلغاء"
          onConfirm={() => { setCancel(false); notify("تم إلغاء الحجز وإصدار المبلغ المسترد", "success"); onDone(); }}
          onCancel={() => setCancel(false)} />
      )}
      {report && <ReportSheet onClose={() => setReport(false)} />}
      {reviews && <ReviewsSheet onClose={() => setReviews(false)} />}
    </div>
  );
}

function ReportSheet({ onClose }: { onClose: () => void }) {
  const reasons = ["محاولة التعامل خارج التطبيق", "لم يحضر", "جودة سيئة", "سلوك/سلامة", "أخرى"];
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center px-6" style={{ background: "rgba(0,0,0,0.45)" }}>
      <Card className="p-6 w-full" style={{ maxWidth: 420 }}>
        <div className="flex items-center justify-between"><h3 style={{ fontWeight: 700, fontSize: 18 }}>الإبلاغ عن مشكلة</h3><button onClick={onClose} aria-label="إغلاق"><X size={20} color="#94A3B8" /></button></div>
        <p className="mt-1" style={{ color: "#475569", fontSize: 13 }}>أبقِ التعامل داخل التطبيق — الضمان والرصيد صالحان فقط للحجوزات داخل Fixly.</p>
        <div className="mt-4 space-y-2">
          {reasons.map(r => (
            <button key={r} onClick={() => { onClose(); notify("تم استلام بلاغك، سيراجعه فريقنا", "success"); }} className="w-full text-start p-3 rounded-xl border border-slate-200 flex items-center justify-between" style={{ fontSize: 14 }}>
              {r} <ChevronLeft size={16} color="#94A3B8" />
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ReviewsSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center px-6" style={{ background: "rgba(0,0,0,0.45)" }}>
      <Card className="p-6 w-full" style={{ maxWidth: 460 }}>
        <div className="flex items-center justify-between"><h3 style={{ fontWeight: 700, fontSize: 18 }}>تقييمات {TECH.name}</h3><button onClick={onClose} aria-label="إغلاق"><X size={20} color="#94A3B8" /></button></div>
        <div className="mt-2 flex items-center gap-2"><Stars rating={TECH.rating} size={18} /><span style={{ color: "#94A3B8", fontSize: 13 }}>(<span style={{ fontFamily: "Inter" }}>{TECH.jobs}</span> خدمة)</span></div>
        <div className="mt-4 space-y-3 max-h-[300px] overflow-y-auto">
          {REVIEWS.map(r => (
            <div key={r.name} className="pb-3 border-b last:border-0 border-slate-100">
              <div className="flex items-center gap-2"><Avatar name={r.name} size={28} /><span style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</span><span className="mr-auto"><Stars rating={r.rating} size={12} /></span></div>
              <p className="mt-1.5" style={{ fontSize: 13, color: "#475569" }}>«{r.text}»</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------- Account ----------
type AccTab = "bookings" | "receipts" | "guarantee" | "addresses" | "payments" | "support" | "protection" | "wallet" | "quotes";
function Account({ member, credit, onSubscribe, onCancelSub }: { member: boolean; credit: number; onSubscribe: () => void; onCancelSub: () => void }) {
  const [tab, setTab] = useState<AccTab>("bookings");
  const nav: { k: AccTab; l: string; Icon: any }[] = [
    { k: "bookings", l: "حجوزاتي", Icon: ListChecks },
    { k: "receipts", l: "الفواتير", Icon: FileText },
    { k: "guarantee", l: "الضمان", Icon: ShieldCheck },
    { k: "wallet", l: "رصيدي", Icon: Wallet },
    { k: "protection", l: "خطة الحماية", Icon: Star },
    { k: "quotes", l: "الفحص المرئي", Icon: Video },
    { k: "addresses", l: "عناويني", Icon: MapPinned },
    { k: "payments", l: "طرق الدفع", Icon: CreditCard },
    { k: "support", l: "الدعم", Icon: Headphones },
  ];
  return (
    <div className="max-w-[1200px] mx-auto px-6 py-10">
      <div className="flex items-center gap-3">
        <Avatar name="أحمد العلي" size={48} />
        <div className="flex-1">
          <div className="flex items-center gap-2"><h1 style={{ fontWeight: 800, fontSize: 24 }}>أحمد العلي</h1>{member && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#B45309", fontSize: 11, fontWeight: 700 }}><Star size={11} fill="#F5A623" strokeWidth={0} /> عضو الحماية</span>}</div>
          <div style={{ color: "#475569", fontSize: 13, fontFamily: "Inter" }} dir="ltr">+962 79 000 0000</div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "#E8F1FE", color: "#1366D6", fontSize: 13, fontWeight: 700 }}><Wallet size={15} /> رصيدك: <span style={{ fontFamily: "Inter" }}>{credit}</span> دينار</span>
      </div>

      <div className="mt-6 grid md:grid-cols-[220px_1fr] gap-6">
        <Card className="p-2 h-fit">
          {nav.map(n => (
            <button key={n.k} onClick={() => setTab(n.k)} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-start" style={{ background: tab === n.k ? "#E8F1FE" : "transparent", color: tab === n.k ? "#1366D6" : "#475569", fontWeight: tab === n.k ? 700 : 600, fontSize: 14 }}>
              <n.Icon size={17} /> {n.l}
            </button>
          ))}
        </Card>

        <div>
          {tab === "bookings" && <Bookings />}
          {tab === "receipts" && <Receipts />}
          {tab === "guarantee" && <Guarantee member={member} />}
          {tab === "wallet" && <WalletView credit={credit} />}
          {tab === "protection" && <Protection member={member} onSubscribe={onSubscribe} onCancelSub={onCancelSub} />}
          {tab === "quotes" && <Quotes />}
          {tab === "addresses" && <Addresses />}
          {tab === "payments" && <Payments />}
          {tab === "support" && <Support member={member} />}
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <><h2 style={{ fontWeight: 800, fontSize: 24 }}>{title}</h2><div className="mt-4">{children}</div></>;
}
function EmptyState({ icon, text, cta, onCta }: { icon: ReactNode; text: string; cta?: string; onCta?: () => void }) {
  return (
    <Card className="p-10 text-center">
      <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center" style={{ background: "#F1F5F9" }}>{icon}</div>
      <p className="mt-3" style={{ color: "#475569", fontSize: 15 }}>{text}</p>
      {cta && <button onClick={onCta} className="mt-4 px-5 h-11 rounded-xl" style={{ background: "#1366D6", color: "#FFF", fontWeight: 700, fontSize: 14 }}>{cta}</button>}
    </Card>
  );
}

function Bookings() {
  const [t, setT] = useState<"active" | "past">("active");
  const active = [{ id: "FX-2481", svc: SERVICES[0], status: "in_progress", date: "02/07/2026" }];
  const past = [
    { id: "FX-2140", svc: SERVICES[2], status: "completed", date: "18/06/2026" },
    { id: "FX-1998", svc: SERVICES[1], status: "cancelled", date: "08/06/2026" },
  ];
  const list = t === "active" ? active : past;
  return (
    <Panel title="حجوزاتي">
      <div className="flex gap-2 mb-4">
        {(["active", "past"] as const).map(k => (
          <button key={k} onClick={() => setT(k)} className="px-4 py-2 rounded-full" style={{ background: t === k ? "#1366D6" : "#F1F5F9", color: t === k ? "#FFF" : "#475569", fontWeight: 700, fontSize: 13 }}>{k === "active" ? "نشطة" : "سابقة"}</button>
        ))}
      </div>
      {list.length === 0 ? <EmptyState icon={<Inbox size={26} color="#94A3B8" />} text="لا توجد حجوزات بعد — اطلب أول خدمة الآن" /> : (
        <div className="space-y-3">
          {list.map(b => (
            <Card key={b.id} className="p-5 flex items-center gap-4">
              <ServiceIcon id={b.svc.id} size={26} />
              <div className="flex-1">
                <div className="flex items-center gap-2"><div style={{ fontWeight: 700, fontSize: 15 }}>{b.svc.ar}</div><span style={{ color: "#94A3B8", fontSize: 12, fontFamily: "Inter" }}>{b.id}</span></div>
                <div style={{ color: "#475569", fontSize: 12, fontFamily: "Inter" }} className="mt-0.5">{b.date}</div>
              </div>
              <StatusBadge status={b.status as any} />
              <PriceBadge amount={b.svc.price} />
            </Card>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Receipts() {
  const rows = [
    { id: "FX-2140", svc: "تنظيف تكييف", date: "18/06/2026", total: 35 },
    { id: "FX-1998", svc: "سباكة", date: "08/06/2026", total: 40 },
  ];
  return (
    <Panel title="الفواتير">
      <div className="space-y-3">
        {rows.map(r => (
          <Card key={r.id} className="p-5 flex items-center gap-4">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#F1F5F9" }}><FileText size={18} color="#475569" /></span>
            <div className="flex-1">
              <div style={{ fontWeight: 700, fontSize: 15 }}>{r.svc} <span style={{ color: "#94A3B8", fontSize: 12, fontFamily: "Inter" }}>· {r.id}</span></div>
              <div style={{ color: "#475569", fontSize: 12, fontFamily: "Inter" }}>{r.date} · دفع آمن</div>
            </div>
            <PriceBadge amount={r.total} />
            <button onClick={() => notify("جارٍ تنزيل الفاتورة")} className="px-3 h-9 rounded-lg" style={{ background: "#E8F1FE", color: "#1366D6", fontWeight: 700, fontSize: 13 }}>تنزيل</button>
          </Card>
        ))}
      </div>
    </Panel>
  );
}

function Guarantee({ member }: { member: boolean }) {
  return (
    <Panel title="الضمان">
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "#DCFCE7" }}><ShieldCheck size={22} color="#15803D" /></span>
          <div><div style={{ fontWeight: 700, fontSize: 16 }}>ضمان {member ? "90" : "30"} يوم على كل خدمة</div><div style={{ color: "#475569", fontSize: 13 }}>إصلاح مجاني أو استرداد. سيتم الرد خلال ساعتين.</div></div>
        </div>
      </Card>
      <h3 className="mt-6 mb-3" style={{ fontWeight: 700, fontSize: 16 }}>الحجوزات المؤهلة</h3>
      <Card className="p-5 flex items-center gap-4">
        <ServiceIcon id="ac" size={24} />
        <div className="flex-1"><div style={{ fontWeight: 700, fontSize: 14 }}>تنظيف تكييف · FX-2140</div><div style={{ color: "#475569", fontSize: 12, fontFamily: "Inter" }}>18/06/2026</div></div>
        <button onClick={() => notify("سيتم الرد خلال ساعتين")} className="px-4 h-10 rounded-lg" style={{ background: "#1366D6", color: "#FFF", fontWeight: 700, fontSize: 13 }}>فتح تذكرة ضمان</button>
      </Card>
    </Panel>
  );
}

function WalletView({ credit }: { credit: number }) {
  const rows = [
    { label: "تعويض تأخير", date: "02/07/2026", amt: 20 },
    { label: "إحالة صديق", date: "20/06/2026", amt: 5 },
    { label: "استخدام على حجز سباكة", date: "08/06/2026", amt: -5 },
  ];
  return (
    <Panel title="رصيدي">
      <Card className="p-6" style={{ background: "linear-gradient(120deg,#1366D6,#0FB5A6)" }}>
        <div style={{ color: "#DBEAFE", fontSize: 13 }}>الرصيد الحالي</div>
        <div className="mt-1" style={{ color: "#FFF", fontWeight: 800, fontSize: 36 }}><span style={{ fontFamily: "Inter" }}>{credit}</span> <span style={{ fontSize: 18 }}>دينار</span></div>
        <div className="mt-1" style={{ color: "#DBEAFE", fontSize: 13 }}>يُخصم تلقائياً من فاتورتك القادمة</div>
      </Card>
      <h3 className="mt-6 mb-3" style={{ fontWeight: 700, fontSize: 16 }}>سجل الحركات</h3>
      {credit === 0 && rows.length === 0 ? <EmptyState icon={<Wallet size={26} color="#94A3B8" />} text="لا يوجد رصيد بعد" /> : (
        <Card className="overflow-hidden">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5 border-b last:border-0 border-slate-100">
              <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: r.amt > 0 ? "#DCFCE7" : "#F1F5F9" }}><Gift size={16} color={r.amt > 0 ? "#15803D" : "#94A3B8"} /></span>
              <div className="flex-1"><div style={{ fontWeight: 600, fontSize: 14 }}>{r.label}</div><div style={{ color: "#94A3B8", fontSize: 12, fontFamily: "Inter" }}>{r.date}</div></div>
              <span style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 15, color: r.amt > 0 ? "#15803D" : "#475569" }}>{r.amt > 0 ? "+" : ""}{r.amt}</span>
            </div>
          ))}
        </Card>
      )}
    </Panel>
  );
}

function Protection({ member, onSubscribe, onCancelSub }: { member: boolean; onSubscribe: () => void; onCancelSub: () => void }) {
  const [cancel, setCancel] = useState(false);
  const benefits = ["أولوية خلال 30 دقيقة", "خصم 15% على كل خدمة", "ضمان ممتد 90 يوم", "فحص مجاني كل 3 أشهر", "دعم VIP"];
  return (
    <Panel title="خطة الحماية">
      <Card className="p-6">
        {member ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Star size={20} fill="#F5A623" strokeWidth={0} /><span style={{ fontWeight: 700, fontSize: 16 }}>عضو الحماية</span></div>
              <span className="px-2.5 py-1 rounded-full" style={{ background: "#DCFCE7", color: "#15803D", fontSize: 12, fontWeight: 700 }}>فعّال</span>
            </div>
            <div className="mt-2" style={{ color: "#475569", fontSize: 14 }}>يتجدد في <span style={{ fontFamily: "Inter" }}>08/07/2026</span> · وفّرت <span style={{ fontFamily: "Inter" }}>18</span> دينار هذا الشهر</div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 800, fontSize: 22 }}>اشترك ووفّر على كل خدمة</div>
            <div className="mt-1" style={{ color: "#475569", fontSize: 14 }}><span style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 20, color: "#0F172A" }}>5</span> دنانير/شهر</div>
          </>
        )}
        <ul className="mt-4 grid sm:grid-cols-2 gap-2.5">
          {benefits.map(b => <li key={b} className="flex items-center gap-2" style={{ fontSize: 14 }}><Check size={17} color="#15803D" /> {b}</li>)}
        </ul>
        {member
          ? <><button onClick={() => setCancel(true)} className="mt-5 px-5 h-11 rounded-xl" style={{ background: "#FFF", color: "#E5484D", border: "1px solid #FCA5A5", fontWeight: 700, fontSize: 14 }}>إلغاء الاشتراك</button><p className="mt-2" style={{ color: "#94A3B8", fontSize: 12 }}>ستبقى المزايا حتى نهاية الفترة.</p></>
          : <button onClick={onSubscribe} className="mt-5 px-6 h-12 rounded-xl" style={{ background: "#1366D6", color: "#FFF", fontWeight: 700 }}>اشترك الآن</button>}
      </Card>
      {cancel && <ConfirmDialog title="إلغاء خطة الحماية؟" body="ستبقى المزايا حتى نهاية الفترة." variant="destructive" confirmLabel="تأكيد الإلغاء" onConfirm={() => { setCancel(false); onCancelSub(); }} onCancel={() => setCancel(false)} />}
    </Panel>
  );
}

function Quotes() {
  const quotes = [{ svc: "تنظيف تكييف", desc: "الوحدة لا تبرّد", status: "quoted", price: 45 }];
  return (
    <Panel title="الفحص المرئي">
      <div className="flex justify-end mb-3">
        <button onClick={() => notify("تم إرسال طلب التسعير")} className="px-4 h-10 rounded-lg flex items-center gap-1.5" style={{ background: "#1366D6", color: "#FFF", fontWeight: 700, fontSize: 14 }}><Plus size={16} /> طلب جديد</button>
      </div>
      {quotes.length === 0 ? <EmptyState icon={<Video size={26} color="#94A3B8" />} text="لا توجد طلبات تسعير بعد" /> : (
        <div className="space-y-3">
          {quotes.map((q, i) => (
            <Card key={i} className="p-5">
              <div className="flex items-center justify-between">
                <div style={{ fontWeight: 700, fontSize: 15 }}>{q.svc}</div>
                <span className="px-2.5 py-1 rounded-full" style={{ background: "#DCFCE7", color: "#15803D", fontSize: 12, fontWeight: 700 }}>مُسعّر</span>
              </div>
              <div className="mt-1" style={{ color: "#475569", fontSize: 13 }}>«{q.desc}»</div>
              <div className="mt-4 flex items-center justify-between">
                <div><div style={{ color: "#475569", fontSize: 12 }}>السعر الثابت</div><PriceBadge amount={q.price} big /></div>
                <button onClick={() => notify("تم إنشاء الحجز بالسعر المتفق عليه", "success")} className="px-5 h-11 rounded-xl" style={{ background: "#1366D6", color: "#FFF", fontWeight: 700, fontSize: 14 }}>اقبل واحجز</button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Addresses() {
  const [list, setList] = useState(["خلدا، شارع وصفي التل، عمارة 12، ط2", "الصويفية، دوار باريس، عمارة 5"]);
  return (
    <Panel title="عناويني">
      <div className="flex justify-end mb-3">
        <button onClick={() => { setList(l => [...l, "عبدون، شارع جديد"]); notify("تم الحفظ", "success"); }} className="px-4 h-10 rounded-lg flex items-center gap-1.5" style={{ background: "#1366D6", color: "#FFF", fontWeight: 700, fontSize: 14 }}><Plus size={16} /> إضافة عنوان</button>
      </div>
      {list.length === 0 ? <EmptyState icon={<MapPin size={26} color="#94A3B8" />} text="أضف عنوانك الأول" /> : (
        <div className="space-y-3">
          {list.map((a, i) => (
            <Card key={i} className="p-5 flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#E8F1FE" }}><MapPin size={18} color="#1366D6" /></span>
              <div className="flex-1" style={{ fontSize: 14 }}>{a}</div>
              <button onClick={() => notify("تعديل العنوان")} style={{ color: "#1366D6", fontSize: 13, fontWeight: 600 }}>تعديل</button>
              <button onClick={() => { setList(l => l.filter((_, j) => j !== i)); notify("تم الحذف"); }} style={{ color: "#E5484D", fontSize: 13, fontWeight: 600 }}>حذف</button>
            </Card>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Payments() {
  return (
    <Panel title="طرق الدفع">
      <div className="space-y-3">
        {[{ b: "Visa", n: "•••• 4242", d: true }, { b: "Mastercard", n: "•••• 8810", d: false }].map((c, i) => (
          <Card key={i} className="p-5 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#F1F5F9" }}><CreditCard size={18} color="#475569" /></span>
            <div className="flex-1"><div style={{ fontWeight: 700, fontSize: 14 }}>{c.b} <span style={{ fontFamily: "Inter", color: "#475569" }}>{c.n}</span></div>{c.d && <span style={{ color: "#15803D", fontSize: 12, fontWeight: 600 }}>افتراضية</span>}</div>
            <button onClick={() => notify("تم الحذف")} style={{ color: "#E5484D", fontSize: 13, fontWeight: 600 }}>حذف</button>
          </Card>
        ))}
        <button onClick={() => notify("إضافة بطاقة جديدة")} className="w-full h-12 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center gap-2" style={{ color: "#1366D6", fontWeight: 700, fontSize: 14 }}><Plus size={18} /> إضافة بطاقة</button>
        <p className="text-center" style={{ color: "#94A3B8", fontSize: 12 }}>دفع آمن 100% — لا دفع نقدي.</p>
      </div>
    </Panel>
  );
}

function Support({ member }: { member: boolean }) {
  const faq = [
    { q: "كيف يعمل الضمان؟", a: "أي خدمة مشمولة بضمان 30 يوم (90 يوم لأعضاء الحماية). افتح تذكرة وسنرد خلال ساعتين." },
    { q: "هل الدفع نقدي؟", a: "لا — الدفع رقمي وآمن 100% عبر Apple Pay أو Google Pay أو البطاقة." },
    { q: "ماذا لو تأخر الفني؟", a: "إن تأخر أكثر من 30 دقيقة نضيف 20 دينار إلى رصيدك تلقائياً." },
  ];
  return (
    <Panel title="الدعم">
      <Card className="p-6">
        <div style={{ fontWeight: 700, fontSize: 16 }}>نحن هنا لمساعدتك 24/7</div>
        <div style={{ color: "#475569", fontSize: 13 }} className="mt-1">{member ? "دعم VIP — أولوية في الرد" : "الرد خلال 5 دقائق · بالعربية"}</div>
        <div className="mt-4 flex gap-3">
          <button onClick={() => notify("جارٍ الاتصال بالدعم")} className="flex-1 h-12 rounded-xl flex items-center justify-center gap-2" style={{ background: "#1366D6", color: "#FFF", fontWeight: 700, fontSize: 14 }}><Phone size={16} /> اتصال</button>
          <button onClick={() => notify("فتح المحادثة")} className="flex-1 h-12 rounded-xl flex items-center justify-center gap-2" style={{ background: "#E8F1FE", color: "#1366D6", fontWeight: 700, fontSize: 14 }}><MessageSquare size={16} /> محادثة</button>
        </div>
      </Card>
      <h3 className="mt-6 mb-3" style={{ fontWeight: 700, fontSize: 16 }}>الأسئلة الشائعة</h3>
      <FaqLike items={faq} />
    </Panel>
  );
}

// local faq (uses shared FaqAccordion signature)
function FaqLike({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Card className="overflow-hidden">
      {items.map((it, i) => (
        <div key={i} className="border-b last:border-0 border-slate-100">
          <button onClick={() => setOpen(open === i ? null : i)} className="w-full px-5 py-4 flex items-center gap-2 text-start" aria-expanded={open === i}>
            <span className="flex-1" style={{ fontSize: 14, fontWeight: 600 }}>{it.q}</span>
            <ChevronLeft size={16} color="#94A3B8" style={{ transform: open === i ? "rotate(-90deg)" : "none", transition: "transform .2s" }} />
          </button>
          {open === i && <div className="px-5 pb-4" style={{ color: "#475569", fontSize: 13 }}>{it.a}</div>}
        </div>
      ))}
    </Card>
  );
}

// ---------- Footer ----------
function Footer({ go }: { go: (v: View) => void }) {
  return (
    <footer className="mt-10 border-t border-slate-200 bg-white">
      <div className="max-w-[1200px] mx-auto px-6 py-10 grid md:grid-cols-4 gap-6">
        <div>
          {LOGO}
          <p className="mt-3" style={{ color: "#475569", fontSize: 13 }}>فني محترف خلال 30 دقيقة — في عمّان.</p>
        </div>
        {[
          { t: "الشركة", items: [["عن Fixly"], ["الوظائف"], ["المدوّنة"]] },
          { t: "الخدمات", items: [["كهرباء", "catalog"], ["سباكة", "catalog"], ["تكييف", "catalog"], ["دهان"], ["تركيب أثاث"]] },
          { t: "الدعم", items: [["مركز المساعدة"], ["الضمان"], ["تواصل معنا"], ["+962 6 555 0000"]] },
        ].map(c => (
          <div key={c.t}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{c.t}</div>
            <ul className="mt-3 space-y-1.5">{c.items.map(([label, dest]) => (
              <li key={label}><button onClick={() => dest ? go(dest as View) : notify(label)} style={{ color: "#475569", fontSize: 13 }}>{label}</button></li>
            ))}</ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200 py-4 text-center" style={{ color: "#94A3B8", fontSize: 12 }}>© 2026 Fixly. جميع الحقوق محفوظة.</div>
    </footer>
  );
}
