import { useState, useEffect } from "react";
import {
  Briefcase, Wallet, User, ChevronLeft, Phone, Navigation, MapPin, Camera,
  Star, CheckCircle2, Clock, Plus, AlertCircle, AlertTriangle,
  Bell, Headphones, Video, ShieldCheck, BadgeCheck, Award, Medal, Crown,
  FileText, GraduationCap, Hourglass, UserCheck, XCircle, Check, Gauge,
  Inbox, Power, MessageSquare,
} from "lucide-react";
import {
  PhoneFrame, TopBar, PrimaryButton, Card, Section, Avatar, Stars, ServiceIcon,
  PriceBadge, MapMock, StatusBadge, FullCTA, InlineRow, SERVICES, ConfirmDialog,
  FaqAccordion, notify, soon,
} from "./shared";

type S =
  | "auth" | "otp" | "certify" | "pending" | "approved" | "rejected" | "probation"
  | "home" | "incoming" | "reject-warning" | "active" | "in-progress" | "completed" | "rate-customer"
  | "earnings" | "withdraw" | "ratings" | "scorecard" | "profile" | "suspended"
  | "personal-data" | "services-pricing" | "bank-account" | "tech-notifications" | "tech-support";

const TABS = [
  { id: "home" as S, ar: "الطلبات", Icon: Briefcase, badge: 1 },
  { id: "earnings" as S, ar: "الأرباح", Icon: Wallet },
  { id: "profile" as S, ar: "حسابي", Icon: User },
];

const TEAL = "#0FB5A6";

/* Trust-tier chip (محترف = pro / violet) */
function TierChip({ tier = "pro" }: { tier?: "verified" | "pro" | "elite" | "probation" }) {
  const map = {
    verified: { ar: "موثّق", color: "#1366D6", bg: "#DBEAFE", Icon: BadgeCheck },
    pro: { ar: "محترف", color: "#7C3AED", bg: "#EDE9FE", Icon: Medal },
    elite: { ar: "نخبة", color: "#15803D", bg: "#DCFCE7", Icon: Crown },
    probation: { ar: "تحت التجربة", color: "#B45309", bg: "#FEF3C7", Icon: Hourglass },
  }[tier];
  const { Icon } = map;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: map.bg, color: map.color, fontSize: 11, fontWeight: 700 }}>
      <Icon size={12} /> {map.ar}
    </span>
  );
}

function CertifiedChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: "#E8F1FE", color: "#1366D6", fontSize: 11, fontWeight: 700 }}>
      <ShieldCheck size={12} /> فني معتمد
    </span>
  );
}

export default function TechnicianMobile() {
  const [s, setS] = useState<S>("auth");
  // shared job flow state
  const [arrived, setArrived] = useState(false);
  const [preStartDone, setPreStartDone] = useState(false);
  const [beforePhotos, setBeforePhotos] = useState(0);

  const resetJob = () => { setArrived(false); setPreStartDone(false); setBeforePhotos(0); };

  return (
    <PhoneFrame>
      <div className="h-full overflow-hidden" style={{ background: "#F6F8FB" }}>
        {s === "auth" && <Auth onNext={() => setS("otp")} />}
        {s === "otp" && <Otp onBack={() => setS("auth")} onVerify={() => setS("certify")} />}
        {s === "certify" && <Certify onSubmit={() => setS("pending")} />}
        {s === "pending" && <Pending onApproved={() => setS("probation")} onRejected={() => setS("rejected")} />}
        {s === "rejected" && <Rejected onResubmit={() => setS("certify")} />}
        {s === "probation" && <ProbationIntro onContinue={() => setS("home")} />}
        {s === "approved" && <Approved onContinue={() => setS("home")} />}

        {s === "home" && <HomeDash onIncoming={() => { resetJob(); setS("incoming"); }} onRatings={() => setS("ratings")} onScorecard={() => setS("scorecard")} onRejectWarn={() => setS("reject-warning")} />}
        {s === "incoming" && <Incoming onAccept={() => setS("active")} onReject={() => setS("home")} onBack={() => setS("home")} />}
        {s === "reject-warning" && <RejectWarning onBack={() => setS("home")} />}
        {s === "active" && <Active
          onStart={() => setS("in-progress")} onBack={() => setS("home")}
          arrived={arrived} setArrived={setArrived}
          preStartDone={preStartDone} setPreStartDone={setPreStartDone}
          beforePhotos={beforePhotos} setBeforePhotos={setBeforePhotos}
          onNoShow={() => setS("completed")} />}
        {s === "in-progress" && <InProgressTech onDone={() => setS("completed")} onBack={() => setS("active")} />}
        {s === "completed" && <Completed onRate={() => setS("rate-customer")} onBack={() => setS("home")} />}
        {s === "rate-customer" && <RateCustomer onSubmit={() => setS("home")} onBack={() => setS("completed")} />}

        {s === "earnings" && <Earnings onWithdraw={() => setS("withdraw")} />}
        {s === "withdraw" && <Withdraw onBack={() => setS("earnings")} />}
        {s === "ratings" && <Ratings onBack={() => setS("home")} />}
        {s === "scorecard" && <Scorecard onBack={() => setS("home")} />}
        {s === "profile" && <TechProfile onSuspended={() => setS("suspended")} onScorecard={() => setS("scorecard")} onPersonalData={() => setS("personal-data")} onServicesPricing={() => setS("services-pricing")} onBankAccount={() => setS("bank-account")} onNotifications={() => setS("tech-notifications")} onSupport={() => setS("tech-support")} onLogout={() => setS("auth")} />}
        {s === "suspended" && <Suspended onBack={() => setS("profile")} onSupport={() => setS("tech-support")} />}
        {s === "personal-data" && <TechPersonalData onBack={() => setS("profile")} />}
        {s === "services-pricing" && <TechServicesPricing onBack={() => setS("profile")} />}
        {s === "bank-account" && <TechBankAccount onBack={() => setS("profile")} />}
        {s === "tech-notifications" && <TechNotifications onBack={() => setS("profile")} />}
        {s === "tech-support" && <TechSupport onBack={() => setS("profile")} />}

        {(s === "home" || s === "earnings" || s === "profile") && (
          <div className="absolute bottom-0 inset-x-0 h-16 bg-white border-t border-slate-200 flex">
            {TABS.map(t => {
              const active = s === t.id;
              return (
                <button key={t.id} onClick={() => setS(t.id)} className="flex-1 flex flex-col items-center justify-center gap-0.5 relative">
                  <div className="relative">
                    <t.Icon size={22} color={active ? "#1366D6" : "#94A3B8"} strokeWidth={active ? 2.5 : 2} />
                    {t.badge && <span className="absolute -top-1 -end-2 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ background: "#E5484D", fontFamily: "Inter" }}>{t.badge}</span>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: active ? "#1366D6" : "#94A3B8" }}>{t.ar}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </PhoneFrame>
  );
}

function Auth({ onNext }: { onNext: () => void }) {
  return (
    <div className="h-full bg-white flex flex-col px-5 pt-10 relative">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center" style={{ background: "#1366D6" }}>
          <span style={{ fontSize: 36 }}>🔧</span>
        </div>
        <h1 className="mt-4" style={{ fontWeight: 800, fontSize: 26 }}>Fixly للفنيين</h1>
        <p style={{ color: "#475569", fontSize: 14 }} className="mt-2">سجّل دخولك لتبدأ استقبال الطلبات</p>
      </div>

      <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }} className="mt-8">رقم الهاتف</label>
      <div className="mt-2 h-[52px] border border-slate-200 rounded-xl flex items-center px-4 gap-3 bg-white" dir="ltr">
        <span style={{ fontWeight: 600 }}>+962</span>
        <span className="w-px h-6 bg-slate-200" />
        <input className="flex-1 outline-none" style={{ fontFamily: "Inter", fontSize: 16 }} defaultValue="79 555 1234" />
      </div>
      <p style={{ color: "#94A3B8", fontSize: 11 }} className="mt-2">سنرسل رمز التحقق عبر واتساب</p>
      <FullCTA onClick={onNext}>إرسال الرمز</FullCTA>
    </div>
  );
}

function Otp({ onBack, onVerify }: { onBack: () => void; onVerify: () => void }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [timer] = useState(52);
  const full = digits.every(d => d !== "");
  return (
    <div className="h-full bg-white relative">
      <TopBar title="رمز التحقق" onBack={onBack} />
      <div className="px-5 mt-6 text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center" style={{ background: "#E8F1FE" }}>
          <MessageSquare size={30} color="#1366D6" />
        </div>
        <h1 className="mt-4" style={{ fontWeight: 700, fontSize: 20 }}>أدخل رمز التحقق</h1>
        <p style={{ color: "#475569", fontSize: 13 }} className="mt-1">تم الإرسال عبر واتساب إلى <span style={{ fontFamily: "Inter" }} dir="ltr">+962 79 555 1234</span></p>
        <div className="mt-6 flex justify-center gap-2" dir="ltr">
          {digits.map((d, i) => (
            <input
              key={i}
              value={d}
              onChange={e => {
                const v = e.target.value.replace(/\D/g, "").slice(-1);
                setDigits(prev => prev.map((x, j) => (j === i ? v : x)));
              }}
              className="w-12 h-14 rounded-xl border-2 text-center outline-none"
              style={{ borderColor: d ? "#1366D6" : "#E2E8F0", fontFamily: "Inter", fontWeight: 700, fontSize: 22 }}
              inputMode="numeric"
              maxLength={1}
            />
          ))}
        </div>
        <button onClick={() => notify("تم إرسال رمز جديد عبر واتساب", "success")} className="mt-5" style={{ color: "#1366D6", fontSize: 13, fontWeight: 600 }}>
          إعادة إرسال الرمز <span style={{ fontFamily: "Inter", color: "#94A3B8" }}>({timer}s)</span>
        </button>
      </div>
      <FullCTA onClick={full ? onVerify : () => notify("الرمز غير صحيح.", "error")}>تحقّق</FullCTA>
    </div>
  );
}

/* ---------- Certification stepper onboarding ---------- */

const CERT_STEPS = [
  { key: "kyc", ar: "هوية (KYC)", Icon: UserCheck },
  { key: "docs", ar: "المستندات المهنية", Icon: FileText },
  { key: "interview", ar: "مقابلة", Icon: Phone },
  { key: "test", ar: "اختبار عملي", Icon: Check },
  { key: "training", ar: "تدريب / SOP", Icon: GraduationCap },
  { key: "probation", ar: "قيد التجربة", Icon: Hourglass },
  { key: "certified", ar: "معتمد", Icon: ShieldCheck },
];

function Certify({ onSubmit }: { onSubmit: () => void }) {
  const [uploads, setUploads] = useState({ id: false, cert: false, selfie: false, video: false });
  const [services, setServices] = useState<string[]>(["elec"]);
  const [rate, setRate] = useState(50);
  const [agree, setAgree] = useState(false);
  const [conduct, setConduct] = useState(false);

  const uploadTiles: { key: keyof typeof uploads; label: string; Icon: typeof Camera }[] = [
    { key: "id", label: "الهوية الوطنية", Icon: FileText },
    { key: "cert", label: "شهادة مهنية", Icon: Award },
    { key: "selfie", label: "صورة شخصية", Icon: Camera },
  ];

  // Progress: KYC done once id+selfie, docs done once cert, remaining pending
  const kycDone = uploads.id && uploads.selfie;
  const docsDone = uploads.cert;
  const doneKeys = new Set<string>();
  if (kycDone) doneKeys.add("kyc");
  if (docsDone) doneKeys.add("docs");
  const currentIdx = !kycDone ? 0 : !docsDone ? 1 : 2;

  const canSubmit = kycDone && uploads.video && services.length > 0 && agree && conduct;

  return (
    <div className="h-full bg-white relative">
      <TopBar title="التسجيل كفني معتمد" onBack={() => notify("العودة للخطوة السابقة")} />
      <div className="px-5 mt-3 space-y-5 overflow-y-auto pb-32" style={{ height: "calc(100% - 56px)" }}>

        {/* Stepper */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 style={{ fontWeight: 700, fontSize: 14 }}>مراحل الاعتماد</h3>
            <span style={{ color: "#94A3B8", fontSize: 11 }}>{doneKeys.size} / {CERT_STEPS.length}</span>
          </div>
          <div className="space-y-0">
            {CERT_STEPS.map((st, i) => {
              const done = doneKeys.has(st.key);
              const active = i === currentIdx;
              const color = done ? "#15803D" : active ? "#1366D6" : "#94A3B8";
              const bg = done ? "#DCFCE7" : active ? "#E8F1FE" : "#F1F5F9";
              return (
                <div key={st.key} className="flex items-center gap-3 py-1.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: bg, color }}>
                    {done ? <Check size={16} /> : <st.Icon size={15} />}
                  </div>
                  <span className="flex-1" style={{ fontSize: 13, fontWeight: active || done ? 700 : 500, color: done || active ? "#0F172A" : "#94A3B8" }}>{st.ar}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color }}>{done ? "مكتمل" : active ? "الحالي" : "قيد الانتظار"}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Upload tiles */}
        <div>
          <h3 style={{ fontWeight: 700, fontSize: 14 }} className="mb-2">المستندات والصور</h3>
          <div className="grid grid-cols-3 gap-2">
            {uploadTiles.map(t => {
              const on = uploads[t.key];
              return (
                <button key={t.key} onClick={() => { setUploads(u => ({ ...u, [t.key]: true })); notify("تم التقاط الصورة", "success"); }}
                  className="aspect-square rounded-xl border-2 flex flex-col items-center justify-center gap-1"
                  style={{ borderColor: on ? "#15803D" : "#E2E8F0", background: on ? "#DCFCE7" : "#FFF", borderStyle: on ? "solid" : "dashed" }}>
                  {on ? <Check size={22} color="#15803D" /> : <t.Icon size={20} color="#94A3B8" />}
                  <span style={{ fontSize: 10, fontWeight: 600, color: on ? "#15803D" : "#475569" }}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Intro video */}
        <div>
          <h3 style={{ fontWeight: 700, fontSize: 14 }} className="mb-2">فيديو تعريفي</h3>
          <button onClick={() => { setUploads(u => ({ ...u, video: true })); notify("تم تسجيل الفيديو التعريفي", "success"); }}
            className="w-full p-4 rounded-xl border-2 flex items-center gap-3"
            style={{ borderColor: uploads.video ? "#15803D" : "#E2E8F0", background: uploads.video ? "#DCFCE7" : "#FFF", borderStyle: uploads.video ? "solid" : "dashed" }}>
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: uploads.video ? "#FFF" : "#E8F1FE" }}>
              {uploads.video ? <Check size={20} color="#15803D" /> : <Video size={20} color="#1366D6" />}
            </div>
            <div className="flex-1 text-start">
              <div style={{ fontWeight: 600, fontSize: 13 }}>{uploads.video ? "تم تسجيل الفيديو" : "سجّل فيديو تعريفي قصير"}</div>
              <div style={{ color: "#94A3B8", fontSize: 11 }}>عرّف العملاء بنفسك وخبرتك (30 ثانية)</div>
            </div>
          </button>
        </div>

        {/* Services */}
        <div>
          <h3 style={{ fontWeight: 700, fontSize: 14 }} className="mb-2">الخدمات المُقدّمة</h3>
          <div className="grid grid-cols-3 gap-2">
            {SERVICES.filter(sv => ["elec", "plumb", "ac"].includes(sv.id)).map(sv => {
              const on = services.includes(sv.id);
              return (
                <button key={sv.id} onClick={() => setServices(on ? services.filter(x => x !== sv.id) : [...services, sv.id])} className="p-3 rounded-xl border-2 text-center" style={{ borderColor: on ? "#1366D6" : "#E2E8F0", background: on ? "#E8F1FE" : "#FFF" }}>
                  <div className="mx-auto" style={{ width: 36, height: 36 }}><ServiceIcon id={sv.id} size={18} /></div>
                  <div style={{ fontSize: 11, fontWeight: 600 }} className="mt-1.5">{sv.ar}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Hourly rate */}
        <div>
          <h3 style={{ fontWeight: 700, fontSize: 14 }} className="mb-2">الأجر بالساعة (40–60 دينار)</h3>
          <Card className="p-4">
            <div className="text-center"><span style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 32, color: "#1366D6" }}>{rate}</span> <span style={{ fontWeight: 600 }}>دينار/ساعة</span></div>
            <input type="range" min={40} max={60} value={rate} onChange={e => setRate(Number(e.target.value))} className="w-full mt-3" style={{ accentColor: "#1366D6", direction: "ltr" }} />
            <div className="mt-1 flex justify-between" style={{ color: "#94A3B8", fontSize: 11, fontFamily: "Inter" }}><span>40</span><span>60</span></div>
          </Card>
        </div>

        {/* Agreements */}
        <div className="space-y-2">
          <button onClick={() => setAgree(!agree)} className="w-full flex items-start gap-3 text-start p-3 rounded-xl border border-slate-200">
            <span className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5" style={{ borderColor: agree ? "#1366D6" : "#CBD5E1", background: agree ? "#1366D6" : "#FFF" }}>{agree && <Check size={13} color="#FFF" />}</span>
            <span style={{ fontSize: 12, color: "#475569" }}>أوافق على اتفاقية المقاول مع Fixly.</span>
          </button>
          <button onClick={() => setConduct(!conduct)} className="w-full flex items-start gap-3 text-start p-3 rounded-xl border border-slate-200">
            <span className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5" style={{ borderColor: conduct ? "#1366D6" : "#CBD5E1", background: conduct ? "#1366D6" : "#FFF" }}>{conduct && <Check size={13} color="#FFF" />}</span>
            <span style={{ fontSize: 12, color: "#475569" }}>ألتزم بقواعد السلوك وأبقي التعامل داخل التطبيق (منع التعامل خارج المنصة).</span>
          </button>
        </div>
      </div>
      <FullCTA onClick={canSubmit ? onSubmit : () => notify("أكمل المستندات والفيديو ووافق على الشروط", "error")}>إرسال للمراجعة</FullCTA>
    </div>
  );
}

function Pending({ onApproved, onRejected }: { onApproved: () => void; onRejected: () => void }) {
  return (
    <div className="h-full bg-white flex flex-col items-center justify-center text-center px-8 relative">
      <div className="w-32 h-32 rounded-full flex items-center justify-center" style={{ background: "#FEF3C7" }}>
        <Clock size={64} color="#B45309" />
      </div>
      <h1 className="mt-5" style={{ fontWeight: 700, fontSize: 22 }}>طلبك قيد المراجعة</h1>
      <p style={{ color: "#475569", fontSize: 14 }} className="mt-2">خلال 24 ساعة. سنرسل إشعاراً عند الموافقة.</p>
      <div className="absolute bottom-8 inset-x-5 space-y-2">
        <PrimaryButton variant="outline" onClick={onApproved}>محاكاة: تمت الموافقة</PrimaryButton>
        <PrimaryButton variant="ghost" onClick={onRejected}>محاكاة: مرفوض</PrimaryButton>
      </div>
    </div>
  );
}

function Rejected({ onResubmit }: { onResubmit: () => void }) {
  return (
    <div className="h-full bg-white flex flex-col items-center justify-center text-center px-8 relative">
      <div className="w-32 h-32 rounded-full flex items-center justify-center" style={{ background: "#FEE2E2" }}>
        <XCircle size={64} color="#B91C1C" />
      </div>
      <h1 className="mt-5" style={{ fontWeight: 700, fontSize: 22 }}>لم تتم الموافقة</h1>
      <Card className="mt-4 p-3 w-full text-start" style={{ background: "#FEF2F2" }}>
        <div className="flex items-start gap-2">
          <AlertCircle size={16} color="#B91C1C" className="mt-0.5" />
          <p style={{ color: "#991B1B", fontSize: 13 }}>السبب: صورة الهوية غير واضحة في مرحلة KYC. يرجى إعادة رفع مستند واضح والتقديم مجدداً.</p>
        </div>
      </Card>
      <div className="absolute bottom-8 inset-x-5">
        <PrimaryButton onClick={onResubmit}>إعادة التقديم</PrimaryButton>
      </div>
    </div>
  );
}

function ProbationIntro({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="h-full bg-white flex flex-col items-center justify-center text-center px-8 relative">
      <div className="w-32 h-32 rounded-full flex items-center justify-center" style={{ background: "#DCFCE7" }}>
        <CheckCircle2 size={64} color="#15803D" strokeWidth={2.5} />
      </div>
      <h1 className="mt-5" style={{ fontWeight: 700, fontSize: 22 }}>تم اعتمادك كفني Fixly ✅</h1>
      <Card className="mt-4 p-4 w-full text-start" style={{ background: "#FEF3C7" }}>
        <div className="flex items-center gap-2 mb-1"><Hourglass size={16} color="#B45309" /><span style={{ fontWeight: 700, fontSize: 14, color: "#B45309" }}>قيد التجربة — أول 10 طلبات</span></div>
        <p style={{ color: "#92400E", fontSize: 12 }}>خلال فترة التجربة يكون نطاق الطلبات أضيق مع متابعة أدق لأدائك. أكمل أول 10 طلبات بنجاح لترتقي إلى فئة «موثّق».</p>
      </Card>
      <div className="absolute bottom-8 inset-x-5">
        <PrimaryButton onClick={onContinue}>ابدأ العمل</PrimaryButton>
      </div>
    </div>
  );
}

function Approved({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="h-full bg-white flex flex-col items-center justify-center text-center px-8 relative">
      <div className="w-32 h-32 rounded-full flex items-center justify-center" style={{ background: "#DCFCE7" }}>
        <CheckCircle2 size={72} color="#15803D" strokeWidth={2.5} />
      </div>
      <h1 className="mt-5" style={{ fontWeight: 700, fontSize: 22 }}>تمت الموافقة! 🎉</h1>
      <p style={{ color: "#475569", fontSize: 14 }} className="mt-2">يمكنك الآن البدء في استقبال الطلبات.</p>
      <div className="absolute bottom-8 inset-x-5">
        <PrimaryButton onClick={onContinue}>ابدأ العمل</PrimaryButton>
      </div>
    </div>
  );
}

function HomeDash({ onIncoming, onRatings, onScorecard, onRejectWarn }: { onIncoming: () => void; onRatings: () => void; onScorecard: () => void; onRejectWarn: () => void }) {
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [confirmOffline, setConfirmOffline] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="h-full overflow-y-auto pb-20 relative">
      {/* Probation ribbon */}
      <div className="flex items-center gap-2 px-5 py-2" style={{ background: "#FEF3C7" }}>
        <Hourglass size={14} color="#B45309" />
        <span style={{ fontSize: 12, fontWeight: 600, color: "#92400E" }}>قيد التجربة — أول 10 طلبات (3 مكتملة)</span>
      </div>

      <div className="bg-white px-5 pt-3 pb-4">
        <div className="flex items-center gap-3">
          <Avatar name="خالد المومني" size={48} verified />
          <div className="flex-1">
            <div style={{ fontWeight: 700, fontSize: 16 }}>أهلاً خالد</div>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <CertifiedChip />
              <TierChip tier="pro" />
            </div>
          </div>
        </div>

        <Card className="mt-4 p-4 flex items-center gap-3" style={{ background: online ? `linear-gradient(95deg,${TEAL} 0%,#0D9488 100%)` : "#F1F5F9" }}>
          <Power size={22} color={online ? "#FFF" : "#94A3B8"} />
          <div className="flex-1">
            <div style={{ color: online ? "#FFF" : "#0F172A", fontWeight: 700, fontSize: 16 }}>{online ? "متاح للعمل" : "غير متاح"}</div>
            <div style={{ color: online ? "#CFFAFE" : "#475569", fontSize: 12 }}>{online ? "تستقبل الطلبات الآن" : "لا تظهر للعملاء"}</div>
          </div>
          <button onClick={() => { if (online) setConfirmOffline(true); else { setOnline(true); notify("أنت الآن متاح", "success"); } }} className="w-14 h-8 rounded-full relative transition" style={{ background: online ? "rgba(255,255,255,0.3)" : "#CBD5E1" }}>
            <div className="absolute top-1 w-6 h-6 rounded-full bg-white transition-all" style={{ [online ? "right" : "left"]: 4 }} />
          </button>
        </Card>
      </div>

      <Section>
        <div className="grid grid-cols-3 gap-2">
          {[
            { v: "85", l: "أرباح اليوم", c: "#1366D6" },
            { v: "6", l: "خدمات اليوم", c: TEAL },
            { v: "4.9", l: "تقييم", c: "#F5A623" },
          ].map(k => (
            <Card key={k.l} className="p-3 text-center">
              <div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 22, color: k.c }}>{k.v}</div>
              <div style={{ color: "#475569", fontSize: 11 }} className="mt-0.5">{k.l}</div>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="طلبات قريبة" action={
        <button onClick={() => setEmpty(!empty)} style={{ color: "#1366D6", fontSize: 12, fontWeight: 600 }}>{empty ? "إظهار طلبات" : "لا طلبات؟"}</button>
      }>
        {loading ? (
          <Card className="p-4 space-y-3">
            {[0, 1].map(i => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-11 h-11 rounded-xl bg-slate-200" />
                <div className="flex-1 space-y-2"><div className="h-3 bg-slate-200 rounded w-2/3" /><div className="h-2.5 bg-slate-100 rounded w-1/2" /></div>
              </div>
            ))}
          </Card>
        ) : empty ? (
          <Card className="p-8 text-center">
            <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center" style={{ background: "#F1F5F9" }}><Inbox size={26} color="#94A3B8" /></div>
            <p style={{ color: "#475569", fontSize: 14, fontWeight: 600 }} className="mt-3">لا توجد طلبات قريبة حالياً</p>
            <p style={{ color: "#94A3B8", fontSize: 12 }} className="mt-1">تأكد أنك «متاح» — سننبّهك عند وصول طلب.</p>
          </Card>
        ) : (
          <>
            <MapMock height={140} customerLabel="طلب قريب" />
            <button onClick={onIncoming} className="w-full text-start mt-3">
              <Card className="p-4 border-2" style={{ borderColor: "#1366D6", background: "#E8F1FE" }}>
                <div className="flex items-center gap-3">
                  <ServiceIcon id="elec" size={22} />
                  <div className="flex-1">
                    <div style={{ fontWeight: 700, fontSize: 14 }}>طلب جديد — كهرباء</div>
                    <div style={{ color: "#475569", fontSize: 12 }} className="mt-0.5">خلدا · على بُعد <span style={{ fontFamily: "Inter", fontWeight: 700 }}>1.2</span> كم</div>
                  </div>
                  <PriceBadge amount={50} />
                </div>
                <div className="mt-3 flex items-center justify-between p-2 rounded-lg" style={{ background: "#FFF" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#B45309" }}>اقبل خلال 5 دقائق</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#E5484D" }} />
                    <span style={{ fontFamily: "Inter", fontWeight: 700, color: "#E5484D" }}>4:32</span>
                  </div>
                </div>
              </Card>
            </button>
          </>
        )}

        <button onClick={onScorecard} className="w-full mt-3 text-start">
          <Card className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#EDE9FE" }}><Gauge size={18} color="#7C3AED" /></div>
            <div className="flex-1">
              <div style={{ fontWeight: 600, fontSize: 13 }}>أدائي</div>
              <div style={{ color: "#475569", fontSize: 11 }}>مؤشرات الأداء والفئة</div>
            </div>
            <ChevronLeft size={18} color="#94A3B8" />
          </Card>
        </button>
        <button onClick={onRatings} className="w-full mt-3 text-start">
          <Card className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#FEF3C7" }}><Star size={18} color="#F5A623" fill="#F5A623" /></div>
            <div className="flex-1">
              <div style={{ fontWeight: 600, fontSize: 13 }}>تقييماتي</div>
              <div style={{ color: "#475569", fontSize: 11 }}>عرض تعليقات العملاء</div>
            </div>
            <ChevronLeft size={18} color="#94A3B8" />
          </Card>
        </button>
        <button onClick={onRejectWarn} className="w-full mt-3 text-start">
          <Card className="p-3 flex items-center gap-2" style={{ background: "#FEF2F2" }}>
            <AlertTriangle size={16} color="#B91C1C" />
            <span style={{ fontSize: 12, color: "#991B1B", fontWeight: 600 }}>تنبيه: رفض متكرر للطلبات</span>
          </Card>
        </button>
      </Section>

      {confirmOffline && (
        <ConfirmDialog
          title="الانتقال لوضع غير متاح؟"
          body="لن تستقبل طلبات جديدة أثناء مناوبتك حتى تعود متاحاً."
          confirmLabel="غير متاح"
          cancelLabel="ابقَ متاحاً"
          onConfirm={() => { setOnline(false); setConfirmOffline(false); notify("أنت الآن غير متاح"); }}
          onCancel={() => setConfirmOffline(false)}
        />
      )}
    </div>
  );
}

function RejectWarning({ onBack }: { onBack: () => void }) {
  return (
    <div className="h-full bg-white relative">
      <TopBar title="تنبيه" onBack={onBack} />
      <div className="px-5 mt-8 text-center">
        <div className="w-24 h-24 mx-auto rounded-full flex items-center justify-center" style={{ background: "#FEE2E2" }}>
          <AlertTriangle size={48} color="#B91C1C" />
        </div>
        <h1 className="mt-5" style={{ fontWeight: 700, fontSize: 20 }}>رفضت 3 طلبات متتالية</h1>
        <p style={{ color: "#475569", fontSize: 14 }} className="mt-2 px-4">قد يؤثر الرفض المتكرر على نسبة القبول وفئة الثقة الخاصة بك. حاول قبول الطلبات القريبة قدر الإمكان.</p>
      </div>
      <FullCTA onClick={onBack}>حسناً، فهمت</FullCTA>
    </div>
  );
}

function Incoming({ onAccept, onReject, onBack }: { onAccept: () => void; onReject: () => void; onBack: () => void }) {
  return (
    <div className="h-full bg-white relative flex flex-col">
      <TopBar title="طلب جديد" onBack={onBack} />
      <MapMock height={240} customerLabel="موقع العميل" />
      <div className="flex-1 px-5 pt-4 overflow-y-auto">
        <div className="flex items-center gap-3">
          <ServiceIcon id="elec" size={24} />
          <div className="flex-1">
            <div style={{ fontWeight: 800, fontSize: 18 }}>كهرباء</div>
            <div style={{ color: "#475569", fontSize: 13 }}>إصلاح قاطع رئيسي</div>
          </div>
        </div>
        <Card className="mt-4 p-3 space-y-2">
          <div className="flex items-center gap-2"><MapPin size={16} color="#475569" /><span style={{ fontSize: 13 }}>خلدا، شارع وصفي التل · <span style={{ fontFamily: "Inter", fontWeight: 600 }}>1.2</span> كم</span></div>
          <div className="flex items-center gap-2"><Clock size={16} color="#475569" /><span style={{ fontSize: 13 }}>فوراً — خلال 30 دقيقة</span></div>
        </Card>

        {/* Payout after fee */}
        <Card className="mt-3 p-3">
          <InlineRow label="سعر الخدمة" value="50 دينار" />
          <InlineRow label="عمولة المنصة (20%)" value="−10 دينار" />
          <div className="h-px bg-slate-100 my-1" />
          <div className="flex items-center justify-between py-1">
            <span style={{ fontSize: 14, fontWeight: 700 }}>أرباحك من هذا الطلب</span>
            <span style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 18, color: "#15803D" }}>40 دينار</span>
          </div>
        </Card>

        <div className="mt-4 p-3 rounded-xl text-center" style={{ background: "#FEE2E2" }}>
          <div style={{ color: "#B91C1C", fontSize: 12, fontWeight: 600 }}>اقبل الطلب خلال</div>
          <div className="mt-2 flex items-center justify-center">
            <div className="relative w-20 h-20">
              <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
                <circle cx="40" cy="40" r="34" fill="none" stroke="#FECACA" strokeWidth="6" />
                <circle cx="40" cy="40" r="34" fill="none" stroke="#E5484D" strokeWidth="6" strokeLinecap="round" strokeDasharray={2 * Math.PI * 34} strokeDashoffset={2 * Math.PI * 34 * 0.1} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center" style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 18, color: "#E5484D" }}>4:32</span>
            </div>
          </div>
        </div>
      </div>
      <div className="px-5 pb-6 pt-3 grid grid-cols-2 gap-2 border-t border-slate-100">
        <PrimaryButton variant="outline" onClick={() => { notify("تم رفض الطلب"); onReject(); }}>رفض</PrimaryButton>
        <PrimaryButton onClick={() => { notify("تم قبول الطلب", "success"); onAccept(); }}>قبول</PrimaryButton>
      </div>
    </div>
  );
}

const PRE_START_SOP = [
  "التحقق من هوية العميل والعنوان",
  "تأكيد وصف المشكلة مع العميل",
  "فحص السلامة وقطع التيار عند الحاجة",
  "توفير معدات الحماية الشخصية",
];
const PRE_CLOSE_SOP = [
  "اختبار عمل الإصلاح بالكامل",
  "تنظيف موقع العمل",
  "شرح ما تم للعميل",
  "التقاط صور بعد العمل",
];

function Active({
  onStart, onBack, arrived, setArrived, preStartDone, setPreStartDone, beforePhotos, setBeforePhotos, onNoShow,
}: {
  onStart: () => void; onBack: () => void;
  arrived: boolean; setArrived: (v: boolean) => void;
  preStartDone: boolean; setPreStartDone: (v: boolean) => void;
  beforePhotos: number; setBeforePhotos: (v: number) => void;
  onNoShow: () => void;
}) {
  const [checks, setChecks] = useState<boolean[]>(PRE_START_SOP.map(() => false));
  const [showSop, setShowSop] = useState(false);
  const [confirmNoShow, setConfirmNoShow] = useState(false);
  const allChecked = checks.every(Boolean);
  const canStart = arrived && preStartDone && beforePhotos > 0;

  return (
    <div className="h-full bg-white relative flex flex-col">
      <TopBar title="الطلب النشط" onBack={onBack} />
      <MapMock showRoute showTechPin height={220} customerLabel="عميل" techLabel="أنت" />
      <div className="flex-1 px-5 pt-4 overflow-y-auto pb-32">
        <Card className="p-3 flex items-center gap-3">
          <Avatar name="أحمد العلي" />
          <div className="flex-1">
            <div style={{ fontWeight: 700, fontSize: 14 }}>أحمد العلي</div>
            <div style={{ color: "#475569", fontSize: 12 }}>خلدا — <span style={{ fontFamily: "Inter" }}>1.2</span> كم</div>
          </div>
          {arrived && <StatusBadge status="arrived" />}
        </Card>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => notify("فتح خرائط Google…")} className="h-12 rounded-xl border border-slate-200 flex items-center justify-center gap-2" style={{ fontSize: 13, fontWeight: 600 }}><Navigation size={16} color="#1366D6" /> فتح الخرائط</button>
          <button onClick={() => notify("جارٍ الاتصال بالعميل (رقم مقنّع)…")} className="h-12 rounded-xl border border-slate-200 flex items-center justify-center gap-2" style={{ fontSize: 13, fontWeight: 600 }}><Phone size={16} color="#1366D6" /> اتصال</button>
        </div>

        {!arrived ? (
          <div className="mt-3 space-y-2">
            <PrimaryButton onClick={() => { setArrived(true); notify("تم تسجيل وصولك", "success"); }}>وصلت</PrimaryButton>
            <PrimaryButton variant="outline" onClick={() => setConfirmNoShow(true)}>العميل لم يحضر</PrimaryButton>
          </div>
        ) : (
          <>
            {/* Pre-start SOP */}
            <button onClick={() => setShowSop(true)} className="w-full mt-3 text-start">
              <Card className="p-3 flex items-center gap-3" style={{ background: preStartDone ? "#DCFCE7" : "#FFF" }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: preStartDone ? "#FFF" : "#E8F1FE" }}>{preStartDone ? <Check size={18} color="#15803D" /> : <FileText size={16} color="#1366D6" />}</div>
                <div className="flex-1"><div style={{ fontWeight: 600, fontSize: 13 }}>قائمة ما قبل البدء</div><div style={{ color: "#94A3B8", fontSize: 11 }}>{preStartDone ? "مؤكّدة" : "يجب تأكيدها قبل البدء"}</div></div>
                <ChevronLeft size={18} color="#94A3B8" />
              </Card>
            </button>

            {/* Before photos */}
            <Card className="mt-3 p-3">
              <div style={{ fontWeight: 600, fontSize: 13 }} className="mb-2">صور «قبل» العمل</div>
              <div className="flex gap-2">
                {Array.from({ length: beforePhotos }).map((_, i) => (
                  <div key={i} className="w-16 h-16 rounded-xl flex items-center justify-center" style={{ background: "#DCFCE7" }}><Check size={20} color="#15803D" /></div>
                ))}
                <button onClick={() => { setBeforePhotos(beforePhotos + 1); notify("تم التقاط الصورة", "success"); }} className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center">
                  <Camera size={20} color="#1366D6" />
                </button>
              </div>
            </Card>
          </>
        )}

        {showSop && (
          <div className="absolute inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.45)" }}>
            <div className="w-full bg-white rounded-t-3xl p-5 pb-8">
              <div className="w-9 h-1 rounded-full bg-slate-300 mx-auto mb-4" />
              <h3 style={{ fontWeight: 700, fontSize: 17 }} className="mb-3">قائمة ما قبل البدء</h3>
              <div className="space-y-2">
                {PRE_START_SOP.map((item, i) => (
                  <button key={i} onClick={() => setChecks(c => c.map((v, j) => (j === i ? !v : v)))} className="w-full flex items-center gap-3 text-start p-3 rounded-xl border border-slate-200">
                    <span className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0" style={{ borderColor: checks[i] ? "#1366D6" : "#CBD5E1", background: checks[i] ? "#1366D6" : "#FFF" }}>{checks[i] && <Check size={13} color="#FFF" />}</span>
                    <span style={{ fontSize: 13 }}>{item}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <PrimaryButton onClick={() => { if (allChecked) { setPreStartDone(true); setShowSop(false); notify("تم تأكيد القائمة", "success"); } else notify("أكمل جميع البنود", "error"); }}>تأكيد القائمة</PrimaryButton>
              </div>
            </div>
          </div>
        )}

        {confirmNoShow && (
          <ConfirmDialog
            title="العميل لم يحضر؟"
            body="لم يحضر العميل — قد تُطبّق رسوم كشف. سيتم إبلاغ الدعم."
            confirmLabel="تأكيد عدم الحضور"
            variant="destructive"
            onConfirm={() => { setConfirmNoShow(false); notify("تم تسجيل عدم حضور العميل"); onNoShow(); }}
            onCancel={() => setConfirmNoShow(false)}
          />
        )}
      </div>
      <FullCTA onClick={canStart ? onStart : () => notify("سجّل وصولك، وأكمل قائمة ما قبل البدء والصور", "error")}>بدء الخدمة</FullCTA>
    </div>
  );
}

function InProgressTech({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [items, setItems] = useState<{ desc: string; price: number; status: "pending" | "approved" }[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [checks, setChecks] = useState<boolean[]>(PRE_CLOSE_SOP.map(() => false));
  const [showClose, setShowClose] = useState(false);
  const [closeDone, setCloseDone] = useState(false);
  const [afterPhotos, setAfterPhotos] = useState(0);
  const allChecked = checks.every(Boolean);
  const canFinish = closeDone && afterPhotos > 0;

  return (
    <div className="h-full bg-white relative flex flex-col">
      <TopBar title="الخدمة جارية" onBack={onBack} />
      <div className="flex-1 px-5 mt-3 overflow-y-auto pb-32">
        <div className="text-center">
          <StatusBadge status="in_progress" />
          <div className="mt-5 w-32 h-32 mx-auto rounded-full flex items-center justify-center" style={{ background: "#FEF3C7" }}>
            <span style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 28, color: "#B45309" }}>00:42</span>
          </div>
          <div style={{ color: "#475569", fontSize: 13 }} className="mt-2">المدة المنقضية</div>
        </div>

        {/* Additional work */}
        <Card className="mt-5 p-4 text-start">
          <div style={{ fontWeight: 700, fontSize: 14 }} className="mb-1">عمل إضافي</div>
          <p style={{ color: "#94A3B8", fontSize: 11 }} className="mb-2">لن يُضاف أي مبلغ دون موافقة العميل.</p>
          {items.map((it, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b last:border-0 border-slate-100">
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{it.desc}</div>
                <div style={{ fontSize: 11, color: it.status === "approved" ? "#15803D" : "#B45309" }}>{it.status === "approved" ? "✓ وافق العميل" : "بانتظار موافقة العميل"}</div>
              </div>
              <span style={{ fontFamily: "Inter", fontWeight: 700 }}>{it.price} دينار</span>
            </div>
          ))}
          <button onClick={() => setShowAdd(true)} className="w-full mt-2 p-3 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center gap-2" style={{ color: "#1366D6", fontWeight: 600, fontSize: 13 }}>
            <Plus size={16} /> إضافة بند
          </button>
        </Card>

        {/* Pre-close SOP */}
        <button onClick={() => setShowClose(true)} className="w-full mt-3 text-start">
          <Card className="p-3 flex items-center gap-3" style={{ background: closeDone ? "#DCFCE7" : "#FFF" }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: closeDone ? "#FFF" : "#E8F1FE" }}>{closeDone ? <Check size={18} color="#15803D" /> : <FileText size={16} color="#1366D6" />}</div>
            <div className="flex-1"><div style={{ fontWeight: 600, fontSize: 13 }}>قائمة ما قبل الإغلاق</div><div style={{ color: "#94A3B8", fontSize: 11 }}>{closeDone ? "مؤكّدة" : "يجب تأكيدها قبل الإنهاء"}</div></div>
            <ChevronLeft size={18} color="#94A3B8" />
          </Card>
        </button>

        {/* After photos */}
        <Card className="mt-3 p-3">
          <div style={{ fontWeight: 600, fontSize: 13 }} className="mb-2">صور «بعد» العمل</div>
          <div className="flex gap-2">
            {Array.from({ length: afterPhotos }).map((_, i) => (
              <div key={i} className="w-16 h-16 rounded-xl flex items-center justify-center" style={{ background: "#DCFCE7" }}><Check size={20} color="#15803D" /></div>
            ))}
            <button onClick={() => { setAfterPhotos(afterPhotos + 1); notify("تم التقاط الصورة", "success"); }} className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center">
              <Camera size={20} color="#1366D6" />
            </button>
          </div>
        </Card>
      </div>

      {showAdd && (
        <div className="absolute inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="w-full bg-white rounded-t-3xl p-5 pb-8">
            <div className="w-9 h-1 rounded-full bg-slate-300 mx-auto mb-4" />
            <h3 style={{ fontWeight: 700, fontSize: 17 }} className="mb-3">إضافة عمل إضافي</h3>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>الوصف</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="مثال: استبدال مفتاح إضاءة" className="mt-1 mb-3 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14 }} />
            <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>السعر (دينار)</label>
            <input value={price} onChange={e => setPrice(e.target.value.replace(/\D/g, ""))} placeholder="15" className="mt-1 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14, fontFamily: "Inter" }} inputMode="numeric" />
            <div className="mt-4 space-y-2">
              <PrimaryButton onClick={() => {
                if (!desc || !price) { notify("أدخل الوصف والسعر", "error"); return; }
                setItems([...items, { desc, price: Number(price), status: "pending" }]);
                setDesc(""); setPrice(""); setShowAdd(false);
                notify("تم إرسال البند للعميل للموافقة", "success");
              }}>إرسال للعميل للموافقة</PrimaryButton>
              <PrimaryButton variant="ghost" onClick={() => setShowAdd(false)}>إلغاء</PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {showClose && (
        <div className="absolute inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.45)" }}>
          <div className="w-full bg-white rounded-t-3xl p-5 pb-8">
            <div className="w-9 h-1 rounded-full bg-slate-300 mx-auto mb-4" />
            <h3 style={{ fontWeight: 700, fontSize: 17 }} className="mb-3">قائمة ما قبل الإغلاق</h3>
            <div className="space-y-2">
              {PRE_CLOSE_SOP.map((item, i) => (
                <button key={i} onClick={() => setChecks(c => c.map((v, j) => (j === i ? !v : v)))} className="w-full flex items-center gap-3 text-start p-3 rounded-xl border border-slate-200">
                  <span className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0" style={{ borderColor: checks[i] ? "#1366D6" : "#CBD5E1", background: checks[i] ? "#1366D6" : "#FFF" }}>{checks[i] && <Check size={13} color="#FFF" />}</span>
                  <span style={{ fontSize: 13 }}>{item}</span>
                </button>
              ))}
            </div>
            <div className="mt-4">
              <PrimaryButton onClick={() => { if (allChecked) { setCloseDone(true); setShowClose(false); notify("تم تأكيد القائمة", "success"); } else notify("أكمل جميع البنود", "error"); }}>تأكيد القائمة</PrimaryButton>
            </div>
          </div>
        </div>
      )}

      <FullCTA onClick={canFinish ? onDone : () => notify("أكمل قائمة الإغلاق وصور «بعد»", "error")}>إنهاء الخدمة</FullCTA>
    </div>
  );
}

function Completed({ onRate, onBack }: { onRate: () => void; onBack: () => void }) {
  return (
    <div className="h-full bg-white flex flex-col items-center justify-center px-8 text-center relative">
      <div className="w-28 h-28 rounded-full flex items-center justify-center" style={{ background: "#DCFCE7" }}>
        <CheckCircle2 size={64} color="#15803D" strokeWidth={2.5} />
      </div>
      <h1 className="mt-5" style={{ fontWeight: 700, fontSize: 22 }}>أحسنت! تم إنهاء الخدمة</h1>
      <Card className="mt-5 p-4 w-full text-start">
        <InlineRow label="سعر الخدمة" value="50 دينار" />
        <InlineRow label="عمل إضافي" value="15 دينار" />
        <InlineRow label="عمولة المنصة (20%)" value="−13 دينار" />
        <div className="h-px bg-slate-100 my-1" />
        <InlineRow strong label="صافي أرباحك" value="52 دينار" />
      </Card>
      <div className="absolute bottom-8 inset-x-5 space-y-2">
        <PrimaryButton onClick={onRate}>قيّم العميل</PrimaryButton>
        <PrimaryButton variant="ghost" onClick={onBack}>تم</PrimaryButton>
      </div>
    </div>
  );
}

function RateCustomer({ onSubmit, onBack }: { onSubmit: () => void; onBack: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  return (
    <div className="h-full bg-white relative">
      <TopBar title="تقييم العميل" onBack={onBack} />
      <div className="px-5 mt-4 text-center">
        <Avatar name="أحمد العلي" size={72} />
        <h2 className="mt-3" style={{ fontWeight: 700, fontSize: 18 }}>أحمد العلي</h2>
        <p style={{ color: "#475569", fontSize: 13 }} className="mt-1">كيف كانت تجربتك مع العميل؟</p>
        <div className="flex justify-center gap-2 mt-5">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setRating(n)}>
              <Star size={38} fill={n <= rating ? "#F5A623" : "transparent"} color={n <= rating ? "#F5A623" : "#CBD5E1"} />
            </button>
          ))}
        </div>
        <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="تعليق (اختياري)" className="mt-5 w-full rounded-xl border border-slate-200 p-3 outline-none resize-none" rows={3} style={{ fontSize: 14 }} />
      </div>
      <FullCTA onClick={() => { if (rating === 0) { notify("اختر تقييماً", "error"); return; } notify("شكراً لتقييمك", "success"); onSubmit(); }}>إرسال</FullCTA>
    </div>
  );
}

function Earnings({ onWithdraw }: { onWithdraw: () => void }) {
  return (
    <div className="h-full overflow-y-auto pb-20">
      <div className="px-5 pt-3 pb-4" style={{ background: "linear-gradient(180deg,#1366D6 0%,#0E4FA8 100%)" }}>
        <h1 style={{ fontWeight: 700, fontSize: 22, color: "#FFF" }}>الأرباح</h1>
        <Card className="mt-3 p-5">
          <div style={{ color: "#475569", fontSize: 12 }}>الرصيد المتاح</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 42, color: "#1366D6" }}>310</span>
            <span style={{ fontWeight: 700 }}>دينار</span>
          </div>
          <PrimaryButton onClick={onWithdraw}>سحب الرصيد</PrimaryButton>
          <p style={{ color: "#94A3B8", fontSize: 11 }} className="mt-2 text-center">الحد الأدنى <span style={{ fontFamily: "Inter", fontWeight: 600 }}>20</span> دينار · كل 24 ساعة</p>
        </Card>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Card className="p-3">
            <div style={{ color: "#475569", fontSize: 11 }}>اليوم</div>
            <div className="mt-1" style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 22 }}>85 <span style={{ fontWeight: 600, fontSize: 13 }}>د</span></div>
          </Card>
          <Card className="p-3">
            <div style={{ color: "#475569", fontSize: 11 }}>هذا الشهر</div>
            <div className="mt-1" style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 22 }}>1,240 <span style={{ fontWeight: 600, fontSize: 13 }}>د</span></div>
          </Card>
        </div>
      </div>

      <Section title="آخر المعاملات">
        <Card>
          {[
            { svc: "كهرباء", amount: 50, date: "اليوم · 3:30 م", type: "in" },
            { svc: "تكييف", amount: 35, date: "اليوم · 11:00 ص", type: "in" },
            { svc: "سحب رصيد", amount: 200, date: "أمس · 09/06/2026", type: "out" },
            { svc: "سباكة", amount: 40, date: "05/06/2026", type: "in" },
          ].map((t, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-3 border-b last:border-0 border-slate-100">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: t.type === "in" ? "#DCFCE7" : "#FEE2E2", color: t.type === "in" ? "#15803D" : "#B91C1C", fontWeight: 700 }}>
                {t.type === "in" ? "+" : "−"}
              </div>
              <div className="flex-1">
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t.svc}</div>
                <div style={{ color: "#94A3B8", fontSize: 11 }}>{t.date}</div>
              </div>
              <span style={{ fontFamily: "Inter", fontWeight: 700, color: t.type === "in" ? "#15803D" : "#0F172A" }}>{t.type === "in" ? "+" : "−"}{t.amount} د</span>
            </div>
          ))}
        </Card>
      </Section>
    </div>
  );
}

function Withdraw({ onBack }: { onBack: () => void }) {
  const [amount, setAmount] = useState("200");
  const [status, setStatus] = useState<null | "requested" | "processing" | "paid">(null);
  const balance = 310;
  const num = Number(amount || 0);

  const submit = () => {
    if (num < 20) { notify("الحد الأدنى للسحب 20 دينار", "error"); return; }
    if (num > balance) { notify("المبلغ أكبر من رصيدك المتاح", "error"); return; }
    setStatus("requested");
    notify("تم إرسال طلب السحب", "success");
  };

  if (status) {
    const steps = [
      { key: "requested", ar: "تم الطلب" },
      { key: "processing", ar: "قيد المعالجة" },
      { key: "paid", ar: "تم التحويل" },
    ];
    const idx = steps.findIndex(x => x.key === status);
    return (
      <div className="h-full bg-white relative">
        <TopBar title="حالة السحب" onBack={onBack} />
        <div className="px-5 mt-6 text-center">
          <div className="w-24 h-24 mx-auto rounded-full flex items-center justify-center" style={{ background: "#DCFCE7" }}><CheckCircle2 size={48} color="#15803D" /></div>
          <h1 className="mt-4" style={{ fontWeight: 700, fontSize: 20 }}>تم إرسال طلب السحب</h1>
          <p style={{ color: "#475569", fontSize: 14 }} className="mt-1"><span style={{ fontFamily: "Inter", fontWeight: 700 }}>{num}</span> دينار إلى البنك العربي</p>
          <Card className="mt-6 p-4">
            {steps.map((st, i) => (
              <div key={st.key} className="flex items-center gap-3 py-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: i <= idx ? "#DCFCE7" : "#F1F5F9", color: i <= idx ? "#15803D" : "#94A3B8" }}>{i <= idx ? <Check size={14} /> : i + 1}</div>
                <span className="flex-1 text-start" style={{ fontSize: 13, fontWeight: i === idx ? 700 : 500, color: i <= idx ? "#0F172A" : "#94A3B8" }}>{st.ar}</span>
              </div>
            ))}
          </Card>
        </div>
        <div className="absolute bottom-8 inset-x-5 space-y-2">
          {status !== "paid" && <PrimaryButton variant="outline" onClick={() => setStatus(status === "requested" ? "processing" : "paid")}>محاكاة: التقدّم في الحالة</PrimaryButton>}
          <PrimaryButton onClick={onBack}>تم</PrimaryButton>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white relative">
      <TopBar title="سحب الرصيد" onBack={onBack} />
      <div className="px-5 mt-3 space-y-3">
        <Card className="p-4">
          <div style={{ color: "#475569", fontSize: 12 }}>الرصيد المتاح</div>
          <div className="mt-1"><span style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 28, color: "#1366D6" }}>310</span> <span style={{ fontWeight: 700 }}>دينار</span></div>
        </Card>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600 }}>المبلغ</label>
          <div className="mt-2 h-14 rounded-xl border-2 flex items-center px-4 gap-2" style={{ borderColor: num < 20 ? "#E5484D" : "#1366D6" }}>
            <input value={amount} onChange={e => setAmount(e.target.value.replace(/\D/g, ""))} className="flex-1 outline-none" style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 22 }} inputMode="numeric" />
            <span style={{ fontWeight: 700, color: "#475569" }}>دينار</span>
          </div>
          <p style={{ color: num < 20 ? "#E5484D" : "#94A3B8", fontSize: 11 }} className="mt-1">الحد الأدنى <span style={{ fontFamily: "Inter", fontWeight: 600 }}>20</span> دينار · كل 24 ساعة</p>
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600 }}>الحساب البنكي</label>
          <Card className="mt-2 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "#E8F1FE" }}>🏦</div>
            <div className="flex-1">
              <div style={{ fontWeight: 600, fontSize: 13 }}>البنك العربي</div>
              <div style={{ color: "#475569", fontSize: 11, fontFamily: "Inter" }}>JO94 ARAB 1234 5678</div>
            </div>
            <button onClick={() => notify("انتقل لشاشة الحساب البنكي لتغييره")} style={{ color: "#1366D6", fontSize: 12, fontWeight: 600 }}>تغيير</button>
          </Card>
        </div>
      </div>
      <FullCTA onClick={submit}>تأكيد السحب</FullCTA>
    </div>
  );
}

function Ratings({ onBack }: { onBack: () => void }) {
  return (
    <div className="h-full bg-white">
      <TopBar title="تقييماتي" onBack={onBack} />
      <div className="px-5 mt-3 overflow-y-auto pb-6" style={{ height: "calc(100% - 56px)" }}>
        <Card className="p-5 text-center">
          <div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 56, color: "#F5A623" }}>4.9</div>
          <div className="flex justify-center gap-0.5 mt-1">
            {[1, 2, 3, 4, 5].map(n => <Star key={n} size={18} fill="#F5A623" color="#F5A623" />)}
          </div>
          <div style={{ color: "#475569", fontSize: 12 }} className="mt-1">من <span style={{ fontFamily: "Inter", fontWeight: 600 }}>320</span> تقييم</div>
        </Card>

        <div className="mt-4 space-y-3">
          {[
            { name: "أحمد العلي", rating: 5, comment: "فني محترف ووصل بسرعة. أنصح بالتعامل معه.", date: "اليوم" },
            { name: "سارة خالد", rating: 5, comment: "ممتاز جداً، حلّ المشكلة بدقة وأمانة.", date: "05/06/2026" },
            { name: "محمد الزعبي", rating: 4, comment: "جيد، لكن تأخر قليلاً عن الموعد.", date: "01/06/2026" },
          ].map((r, i) => (
            <Card key={i} className="p-3">
              <div className="flex items-center gap-2">
                <Avatar name={r.name} size={32} />
                <div className="flex-1">
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(n => <Star key={n} size={12} fill={n <= r.rating ? "#F5A623" : "transparent"} color={n <= r.rating ? "#F5A623" : "#CBD5E1"} />)}
                  </div>
                </div>
                <span style={{ color: "#94A3B8", fontSize: 11 }}>{r.date}</span>
              </div>
              <p style={{ color: "#475569", fontSize: 13 }} className="mt-2">{r.comment}</p>
              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded" style={{ background: "#DCFCE7", color: "#15803D", fontSize: 10, fontWeight: 600 }}>تقييم موثّق</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function Scorecard({ onBack }: { onBack: () => void }) {
  const metrics = [
    { label: "التقييم", value: "4.8", good: true },
    { label: "الالتزام بالوقت", value: "96%", good: true },
    { label: "نسبة إعادة العمل / الضمان", value: "3%", good: true },
    { label: "نسبة الشكاوى", value: "2%", good: true },
    { label: "نسبة القبول", value: "88%", good: true },
  ];
  return (
    <div className="h-full bg-white">
      <TopBar title="أدائي" onBack={onBack} />
      <div className="px-5 mt-3 overflow-y-auto pb-6 space-y-4" style={{ height: "calc(100% - 56px)" }}>
        <Card className="p-4 flex items-center gap-3" style={{ background: "#EDE9FE" }}>
          <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center"><Medal size={24} color="#7C3AED" /></div>
          <div className="flex-1">
            <div style={{ color: "#7C3AED", fontSize: 12, fontWeight: 600 }}>فئتك الحالية</div>
            <div style={{ fontWeight: 800, fontSize: 18, color: "#0F172A" }}>محترف</div>
          </div>
          <CertifiedChip />
        </Card>

        <Card>
          {metrics.map((m, i) => (
            <div key={i} className="px-4 py-3.5 flex items-center gap-3 border-b last:border-0 border-slate-100">
              <div className="w-2 h-2 rounded-full" style={{ background: m.good ? "#15803D" : "#E5484D" }} />
              <span className="flex-1" style={{ fontSize: 14, color: "#0F172A", fontWeight: 600 }}>{m.label}</span>
              <span style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 16, color: m.good ? "#15803D" : "#E5484D" }}>{m.value}</span>
            </div>
          ))}
        </Card>

        <Card className="p-4" style={{ background: "#E8F1FE" }}>
          <div className="flex items-center gap-2 mb-2"><Award size={16} color="#1366D6" /><span style={{ fontWeight: 700, fontSize: 14, color: "#0E4FA8" }}>كيف ترتقي لفئة «نخبة»؟</span></div>
          <ul style={{ color: "#0E4FA8", fontSize: 12, lineHeight: 1.8 }} className="ps-4 list-disc">
            <li>حافظ على تقييم 4.9 فأعلى</li>
            <li>ارفع نسبة القبول إلى 95%+</li>
            <li>اخفض نسبة إعادة العمل تحت 2%</li>
            <li>أكمل 500 خدمة بدون شكاوى مؤكدة</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function TechProfile({ onSuspended, onScorecard, onPersonalData, onServicesPricing, onBankAccount, onNotifications, onSupport, onLogout }: {
  onSuspended: () => void; onScorecard: () => void; onPersonalData: () => void; onServicesPricing: () => void;
  onBankAccount: () => void; onNotifications: () => void; onSupport: () => void; onLogout: () => void;
}) {
  const [confirmLogout, setConfirmLogout] = useState(false);

  const menuItems = [
    { label: "أدائي (بطاقة الأداء)", action: onScorecard },
    { label: "البيانات الشخصية", action: onPersonalData },
    { label: "الخدمات والأسعار", action: onServicesPricing },
    { label: "الحساب البنكي", action: onBankAccount },
    { label: "الإشعارات", action: onNotifications },
    { label: "الدعم", action: onSupport },
    { label: "حالة الحساب (موقوف)", action: onSuspended },
  ];

  return (
    <div className="h-full overflow-y-auto pb-20 relative">
      <div className="bg-white px-5 pt-5 pb-5 text-center">
        <Avatar name="خالد المومني" size={80} verified />
        <h1 className="mt-3" style={{ fontWeight: 700, fontSize: 20 }}>خالد المومني</h1>
        <div className="flex justify-center gap-1.5 mt-2 flex-wrap">
          <CertifiedChip />
          <TierChip tier="pro" />
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: "#DCFCE7", color: "#15803D", fontSize: 11, fontWeight: 700 }}><ShieldCheck size={12} /> مؤمّن</span>
        </div>

        {/* Intro video */}
        <button onClick={() => notify("تشغيل الفيديو التعريفي…")} className="mt-4 w-full">
          <Card className="p-3 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#E8F1FE" }}><Video size={22} color="#1366D6" /></div>
            <div className="flex-1 text-start"><div style={{ fontWeight: 600, fontSize: 13 }}>الفيديو التعريفي</div><div style={{ color: "#94A3B8", fontSize: 11 }}>مشاهدة تعريفك للعملاء</div></div>
            <ChevronLeft size={16} color="#94A3B8" />
          </Card>
        </button>

        {/* Credentials */}
        <div className="mt-3 flex gap-2">
          <Card className="flex-1 p-3 flex items-center gap-2"><FileText size={16} color="#1366D6" /><span style={{ fontSize: 12, fontWeight: 600 }}>شهادة كهرباء</span></Card>
          <Card className="flex-1 p-3 flex items-center gap-2"><FileText size={16} color="#1366D6" /><span style={{ fontSize: 12, fontWeight: 600 }}>رخصة مهنية</span></Card>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div><div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 18 }}>320</div><div style={{ fontSize: 11, color: "#475569" }}>خدمة</div></div>
          <div><div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 18 }}>4.9</div><div style={{ fontSize: 11, color: "#475569" }}>تقييم</div></div>
          <div><div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 18 }}>88%</div><div style={{ fontSize: 11, color: "#475569" }}>قبول</div></div>
        </div>
      </div>
      <Section>
        <Card>
          {menuItems.map((item, i) => (
            <button key={i} onClick={item.action} className="w-full px-4 py-3.5 flex items-center text-start border-b border-slate-100">
              <span className="flex-1" style={{ fontSize: 14, color: "#0F172A", fontWeight: 600 }}>{item.label}</span>
              <ChevronLeft size={16} color="#94A3B8" />
            </button>
          ))}
          <button onClick={() => setConfirmLogout(true)} className="w-full px-4 py-3.5 flex items-center text-start">
            <span className="flex-1" style={{ fontSize: 14, color: "#E5484D", fontWeight: 600 }}>تسجيل الخروج</span>
            <ChevronLeft size={16} color="#94A3B8" />
          </button>
        </Card>
      </Section>

      {confirmLogout && (
        <ConfirmDialog
          title="تسجيل الخروج؟"
          body="هل أنت متأكد من تسجيل الخروج؟"
          confirmLabel="تسجيل الخروج"
          variant="destructive"
          onConfirm={onLogout}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </div>
  );
}

/* ---------- Tech sub-screens ---------- */

function TechPersonalData({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("خالد المومني");
  const [email, setEmail] = useState("khaled@example.com");
  return (
    <div className="h-full bg-white relative">
      <TopBar title="البيانات الشخصية" onBack={onBack} />
      <div className="px-5 mt-5 space-y-4">
        <div className="flex flex-col items-center mb-2">
          <div className="relative">
            <Avatar name={name} size={80} verified />
            <button onClick={() => notify("تم تحديث الصورة", "success")} aria-label="تغيير الصورة" className="absolute bottom-0 end-0 w-8 h-8 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center">
              <Camera size={14} color="#1366D6" />
            </button>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>الاسم الكامل</label>
          <input value={name} onChange={e => setName(e.target.value)} className="mt-2 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14 }} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>البريد الإلكتروني</label>
          <input value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14, fontFamily: "Inter" }} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>رقم الهاتف</label>
          <div className="mt-2 h-12 rounded-xl border border-slate-200 bg-slate-50 flex items-center px-4">
            <span style={{ fontFamily: "Inter", color: "#94A3B8" }}>+962 79 555 1234</span>
            <span className="ms-2 px-1.5 py-0.5 rounded" style={{ background: "#E2E8F0", color: "#64748B", fontSize: 10, fontWeight: 700 }}>لا يمكن تغييره</span>
          </div>
        </div>
      </div>
      <FullCTA onClick={() => { notify("تم الحفظ", "success"); onBack(); }}>حفظ التغييرات</FullCTA>
    </div>
  );
}

function TechServicesPricing({ onBack }: { onBack: () => void }) {
  const [services, setServices] = useState<string[]>(["elec", "plumb"]);
  const [rate, setRate] = useState(50);
  return (
    <div className="h-full bg-white relative">
      <TopBar title="الخدمات والأسعار" onBack={onBack} />
      <div className="px-5 mt-3 overflow-y-auto pb-32" style={{ height: "calc(100% - 56px)" }}>
        <p style={{ color: "#475569", fontSize: 13 }} className="mb-3">اختر الخدمات التي تقدمها</p>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {SERVICES.filter(sv => ["elec", "plumb", "ac"].includes(sv.id)).map(sv => {
            const on = services.includes(sv.id);
            return (
              <button key={sv.id} onClick={() => setServices(on ? services.filter(x => x !== sv.id) : [...services, sv.id])} className="p-3 rounded-xl border-2 text-center" style={{ borderColor: on ? "#1366D6" : "#E2E8F0", background: on ? "#E8F1FE" : "#FFF" }}>
                <div className="mx-auto" style={{ width: 36, height: 36 }}><ServiceIcon id={sv.id} size={18} /></div>
                <div style={{ fontSize: 11, fontWeight: 600 }} className="mt-1.5">{sv.ar}</div>
              </button>
            );
          })}
        </div>
        <div>
          <h3 style={{ fontWeight: 700, fontSize: 14 }} className="mb-2">الأجر بالساعة (40–60 دينار)</h3>
          <Card className="p-4">
            <div className="text-center"><span style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 32, color: "#1366D6" }}>{rate}</span> <span style={{ fontWeight: 600 }}>دينار/ساعة</span></div>
            <input type="range" min={40} max={60} value={rate} onChange={e => setRate(Number(e.target.value))} className="w-full mt-3" style={{ accentColor: "#1366D6", direction: "ltr" }} />
            <div className="mt-1 flex justify-between" style={{ color: "#94A3B8", fontSize: 11, fontFamily: "Inter" }}><span>40</span><span>60</span></div>
          </Card>
        </div>
      </div>
      <FullCTA onClick={() => { notify("تم الحفظ", "success"); onBack(); }}>حفظ</FullCTA>
    </div>
  );
}

function TechBankAccount({ onBack }: { onBack: () => void }) {
  const [holder, setHolder] = useState("خالد المومني");
  const [iban, setIban] = useState("JO94 ARAB 1234 5678");
  return (
    <div className="h-full bg-white relative">
      <TopBar title="الحساب البنكي" onBack={onBack} />
      <div className="px-5 mt-3 space-y-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#E8F1FE", fontSize: 22 }}>🏦</div>
          <div className="flex-1">
            <div style={{ fontWeight: 700, fontSize: 14 }}>البنك العربي</div>
            <div style={{ color: "#475569", fontSize: 12, fontFamily: "Inter" }}>{iban}</div>
          </div>
          <span className="px-1.5 py-0.5 rounded" style={{ background: "#DCFCE7", color: "#15803D", fontSize: 10, fontWeight: 700 }}>نشط</span>
        </Card>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>اسم صاحب الحساب</label>
          <input value={holder} onChange={e => setHolder(e.target.value)} className="mt-2 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14 }} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>رقم IBAN</label>
          <input value={iban} onChange={e => setIban(e.target.value)} className="mt-2 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14, fontFamily: "Inter" }} dir="ltr" />
        </div>
        <Card className="p-3 flex items-start gap-2" style={{ background: "#E8F1FE" }}>
          <AlertCircle size={16} color="#1366D6" />
          <p style={{ color: "#0E4FA8", fontSize: 12 }}>يتم التحقق من الحساب البنكي خلال 24 ساعة</p>
        </Card>
      </div>
      <FullCTA onClick={() => { notify("تم الحفظ", "success"); onBack(); }}>حفظ التغييرات</FullCTA>
    </div>
  );
}

function TechNotifications({ onBack }: { onBack: () => void }) {
  const [prefs, setPrefs] = useState({ newRequests: true, reminders: true, earnings: true, promos: false });
  const rows: { key: keyof typeof prefs; label: string; sub: string }[] = [
    { key: "newRequests", label: "طلبات جديدة", sub: "إشعار فوري عند وصول طلب" },
    { key: "reminders", label: "تذكيرات المواعيد", sub: "قبل الموعد بـ 15 دقيقة" },
    { key: "earnings", label: "تحديثات الأرباح", sub: "عند استلام مبلغ جديد" },
    { key: "promos", label: "العروض والأخبار", sub: "نصائح وعروض Fixly" },
  ];
  return (
    <div className="h-full bg-white">
      <TopBar title="الإشعارات" onBack={onBack} />
      <div className="px-5 mt-3">
        <Card>
          {rows.map(r => (
            <div key={r.key} className="px-4 py-3.5 flex items-center gap-3 border-b last:border-0 border-slate-100">
              <div className="flex-1">
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.label}</div>
                <div style={{ color: "#94A3B8", fontSize: 12 }}>{r.sub}</div>
              </div>
              <button onClick={() => setPrefs({ ...prefs, [r.key]: !prefs[r.key] })} className="w-12 h-7 rounded-full relative transition-colors" style={{ background: prefs[r.key] ? "#1366D6" : "#CBD5E1" }}>
                <div className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all" style={{ [prefs[r.key] ? "right" : "left"]: 2 }} />
              </button>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function TechSupport({ onBack }: { onBack: () => void }) {
  return (
    <div className="h-full bg-white">
      <TopBar title="الدعم والمساعدة" onBack={onBack} />
      <div className="px-5 mt-3 space-y-3 overflow-y-auto pb-6" style={{ height: "calc(100% - 56px)" }}>
        <Card className="p-4 flex items-center gap-3" style={{ background: "linear-gradient(95deg,#1366D6 0%,#0E4FA8 100%)" }}>
          <Headphones size={28} color="#FFF" />
          <div className="flex-1">
            <div style={{ color: "#FFF", fontWeight: 700, fontSize: 15 }}>دعم الفنيين 24/7</div>
            <div style={{ color: "#CFE0FB", fontSize: 12 }}>الرد خلال 5 دقائق</div>
          </div>
          <button onClick={() => notify("جارٍ الاتصال بالدعم…")} className="w-10 h-10 rounded-full bg-white flex items-center justify-center"><Phone size={18} color="#1366D6" /></button>
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => notify("مركز المساعدة")} className="text-start">
            <Card className="p-4 text-center">
              <Bell size={24} color="#1366D6" className="mx-auto mb-2" />
              <div style={{ fontWeight: 700, fontSize: 14 }}>مركز المساعدة</div>
              <div style={{ color: "#475569", fontSize: 11 }} className="mt-0.5">أسئلة شائعة</div>
            </Card>
          </button>
          <button onClick={() => notify("تم استلام بلاغك، سيراجعه فريقنا", "success")} className="text-start">
            <Card className="p-4 text-center">
              <AlertCircle size={24} color="#E5484D" className="mx-auto mb-2" />
              <div style={{ fontWeight: 700, fontSize: 14 }}>الإبلاغ عن مشكلة</div>
              <div style={{ color: "#475569", fontSize: 11 }} className="mt-0.5">عميل · دفع · أخرى</div>
            </Card>
          </button>
        </div>
        <Section title="الأسئلة الشائعة">
          <FaqAccordion items={[
            { q: "كيف أسحب أرباحي؟", a: "من شاشة الأرباح، اضغط 'سحب الرصيد' وأدخل المبلغ. يصل الحوالة خلال 24 ساعة." },
            { q: "متى يُضاف المبلغ؟", a: "يُضاف مبلغ الخدمة فور تأكيد العميل اكتمالها." },
            { q: "كيف أرفع مستنداً؟", a: "من 'البيانات الشخصية' أو شاشة الاعتماد اضغط زر الكاميرا لرفع المستند." },
            { q: "ماذا أفعل عند مشكلة؟", a: "تواصل معنا عبر زر الدعم 24/7 — الرد خلال 5 دقائق." },
          ]} />
        </Section>
      </div>
    </div>
  );
}

function Suspended({ onBack, onSupport }: { onBack: () => void; onSupport: () => void }) {
  return (
    <div className="h-full bg-white flex flex-col items-center justify-center text-center px-8 relative">
      <div className="w-28 h-28 rounded-full flex items-center justify-center" style={{ background: "#FEE2E2" }}>
        <AlertCircle size={64} color="#B91C1C" />
      </div>
      <h1 className="mt-5" style={{ fontWeight: 700, fontSize: 22 }}>الحساب موقوف مؤقتاً</h1>
      <p style={{ color: "#475569", fontSize: 14 }} className="mt-2">السبب: بلاغات مؤكدة بمحاولة التعامل خارج المنصة. تواصل مع الدعم للمراجعة.</p>
      <Card className="mt-4 p-3 w-full text-start" style={{ background: "#FEF2F2" }}>
        <p style={{ color: "#991B1B", fontSize: 12 }}>أبقِ التعامل داخل التطبيق — الضمان والرصيد صالحان فقط للحجوزات داخل Fixly.</p>
      </Card>
      <div className="absolute bottom-8 inset-x-5 space-y-2">
        <PrimaryButton onClick={onSupport}>تواصل مع الدعم</PrimaryButton>
        <PrimaryButton variant="ghost" onClick={onBack}>رجوع</PrimaryButton>
      </div>
    </div>
  );
}
