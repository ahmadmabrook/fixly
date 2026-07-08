import { useState, useEffect } from "react";
import {
  Search, MapPin, Bell, ChevronLeft, Headphones, Tag, Calendar,
  CreditCard, ShieldCheck, Phone, MessageCircle, X, Star, Camera, CheckCircle2,
  Home, ClipboardList, User, AlertCircle, Plus, ChevronDown, Apple, Clock,
  Sun, Moon, Settings as SettingsIcon, Download, Share2, Video, Flag, Gift,
  BadgeCheck, Award, Wallet, WifiOff, MoreVertical, FileText,
  PlayCircle, RefreshCw,
} from "lucide-react";
import {
  PhoneFrame, SERVICES, ServiceIcon, PriceBadge, TopBar, StatusBadge, Stars,
  PrimaryButton, MapMock, Avatar, Card, Section, GuaranteePill, StepIndicator,
  FullCTA, InlineRow, ConfirmDialog, FaqAccordion, notify, soon,
} from "./shared";

// Launch (bookable) vs coming-soon
const LAUNCH_IDS = ["elec", "plumb", "ac"] as const;
const isLaunch = (id: string) => (LAUNCH_IDS as readonly string[]).includes(id);
const CREDIT_BALANCE = 20; // service-credit wallet balance (دينار)

type Screen =
  | "splash" | "onboarding" | "phone" | "otp" | "permissions"
  | "home" | "service" | "time" | "location" | "payment" | "review" | "searching"
  | "assigned" | "tracking" | "reviews" | "report" | "cancel" | "arrived"
  | "in-progress" | "approve-work" | "completed" | "rate"
  | "bookings" | "booking-detail" | "guarantee" | "guarantee-new" | "guarantee-ticket"
  | "profile" | "edit-profile" | "addresses" | "payment-methods" | "notifications" | "support" | "settings"
  | "settings-language" | "settings-notifications-pref" | "settings-appearance"
  | "protection" | "wallet" | "video-quotes" | "video-new" | "referral"
  | "no-techs" | "payment-failed" | "offline" | "location-denied";

const TABS = [
  { id: "home" as Screen, ar: "الرئيسية", Icon: Home },
  { id: "bookings" as Screen, ar: "حجوزاتي", Icon: ClipboardList, badge: 1 },
  { id: "guarantee" as Screen, ar: "الضمان", Icon: ShieldCheck },
  { id: "profile" as Screen, ar: "حسابي", Icon: User },
];

export default function CustomerMobile() {
  const [screen, setScreen] = useState<Screen>("splash");
  const [selectedService, setSelectedService] = useState<typeof SERVICES[number]>(SERVICES[0]);
  const [bookingStep, setBookingStep] = useState(0);
  const [otp, setOtp] = useState("");
  const [resendTimer, setResendTimer] = useState(45);
  const [member, setMember] = useState(false); // Protection Plan membership
  const [renewDate] = useState("08/07/2026");

  useEffect(() => {
    if (screen === "otp" && resendTimer > 0) {
      const t = setTimeout(() => setResendTimer(r => r - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [screen, resendTimer]);

  const go = (s: Screen) => setScreen(s);
  const tabActive = TABS.some(t => t.id === screen) ? screen : null;

  return (
    <PhoneFrame>
      <div className="h-full overflow-hidden" style={{ background: "#F6F8FB" }}>
        {screen === "splash" && <Splash onContinue={() => go("onboarding")} />}
        {screen === "onboarding" && <Onboarding onDone={() => go("phone")} />}
        {screen === "phone" && <PhoneEntry onSubmit={() => { setResendTimer(45); go("otp"); }} onBack={() => go("onboarding")} />}
        {screen === "otp" && <OtpVerify otp={otp} setOtp={setOtp} resendTimer={resendTimer} onDone={() => go("permissions")} onBack={() => go("phone")} onResend={() => { setResendTimer(45); notify("تم إرسال رمز جديد عبر واتساب", "success"); }} />}
        {screen === "permissions" && <Permissions onDone={() => go("home")} />}

        {screen === "home" && <HomeScreen member={member} onPickService={(s) => { setSelectedService(s); go("service"); }} onTracking={() => go("tracking")} onNotifications={() => go("notifications")} onSupport={() => go("support")} onProtection={() => go("protection")} onWallet={() => go("wallet")} onVideo={() => go("video-quotes")} onOffline={() => go("offline")} />}
        {screen === "service" && <ServiceDetail svc={selectedService} onBack={() => go("home")} onBook={() => { setBookingStep(0); go("time"); }} onVideo={() => go("video-quotes")} />}
        {screen === "time" && <TimeStep onBack={() => go("service")} onNext={() => { setBookingStep(1); go("location"); }} />}
        {screen === "location" && <LocationStep onBack={() => go("time")} onNext={() => { setBookingStep(2); go("payment"); }} onDenied={() => go("location-denied")} />}
        {screen === "payment" && <PaymentStep onBack={() => go("location")} onNext={() => { setBookingStep(3); go("review"); }} />}
        {screen === "review" && <ReviewStep svc={selectedService} member={member} onBack={() => go("payment")} onConfirm={() => go("searching")} onFail={() => go("payment-failed")} />}
        {screen === "searching" && <Searching onAssign={() => go("assigned")} onCancel={() => go("home")} onNoTechs={() => go("no-techs")} />}
        {screen === "assigned" && <TechnicianAssigned svc={selectedService} onTrack={() => go("tracking")} onReviews={() => go("reviews")} onCancel={() => go("cancel")} />}
        {screen === "tracking" && <LiveTracking svc={selectedService} onCancel={() => go("cancel")} onArrived={() => go("arrived")} onInProgress={() => go("in-progress")} onBack={() => go("home")} onReport={() => go("report")} onReviews={() => go("reviews")} />}
        {screen === "reviews" && <TechnicianReviews onBack={() => go("tracking")} />}
        {screen === "report" && <ReportTechnician onBack={() => go("tracking")} onDone={() => go("tracking")} />}
        {screen === "arrived" && <Arrived onInProgress={() => go("in-progress")} onWallet={() => go("wallet")} onBack={() => go("tracking")} />}
        {screen === "cancel" && <CancelFlow onBack={() => go("tracking")} onDone={() => go("home")} />}
        {screen === "in-progress" && <InProgress onApprove={() => go("approve-work")} onDone={() => go("completed")} />}
        {screen === "approve-work" && <ApproveWork onBack={() => go("in-progress")} onApproved={() => go("in-progress")} />}
        {screen === "completed" && <Completed onRate={() => go("rate")} />}
        {screen === "rate" && <RateTechnician onSubmit={() => go("home")} />}

        {screen === "bookings" && <Bookings onOpen={() => go("booking-detail")} />}
        {screen === "booking-detail" && <BookingDetail onBack={() => go("bookings")} />}
        {screen === "guarantee" && <GuaranteeHome member={member} onNew={() => go("guarantee-new")} onTicket={() => go("guarantee-ticket")} />}
        {screen === "guarantee-new" && <GuaranteeNew onBack={() => go("guarantee")} onDone={() => go("guarantee-ticket")} />}
        {screen === "guarantee-ticket" && <GuaranteeTicket onBack={() => go("guarantee")} />}

        {screen === "profile" && <Profile member={member} onAddresses={() => go("addresses")} onPayments={() => go("payment-methods")} onNotifs={() => go("notifications")} onSupport={() => go("support")} onSettings={() => go("settings")} onEditProfile={() => go("edit-profile")} onProtection={() => go("protection")} onWallet={() => go("wallet")} onVideo={() => go("video-quotes")} onReferral={() => go("referral")} />}
        {screen === "edit-profile" && <EditProfile onBack={() => go("profile")} />}
        {screen === "addresses" && <Addresses onBack={() => go("profile")} />}
        {screen === "payment-methods" && <PaymentMethods onBack={() => go("profile")} />}
        {screen === "notifications" && <Notifications onBack={() => go("profile")} />}
        {screen === "support" && <Support member={member} onBack={() => go("profile")} />}
        {screen === "settings" && <Settings onBack={() => go("profile")} onLanguage={() => go("settings-language")} onNotifPref={() => go("settings-notifications-pref")} onAppearance={() => go("settings-appearance")} onLogout={() => go("splash")} />}
        {screen === "settings-language" && <SettingsLanguage onBack={() => go("settings")} />}
        {screen === "settings-notifications-pref" && <SettingsNotificationsPref onBack={() => go("settings")} />}
        {screen === "settings-appearance" && <SettingsAppearance onBack={() => go("settings")} />}

        {screen === "protection" && <ProtectionPlan member={member} renewDate={renewDate} onBack={() => go("profile")} onSubscribe={() => { setMember(true); notify("تم تفعيل خطة الحماية", "success"); }} onCancel={() => { setMember(false); notify("سيتم إلغاء الاشتراك في نهاية الفترة"); }} />}
        {screen === "wallet" && <WalletScreen onBack={() => go("profile")} />}
        {screen === "video-quotes" && <VideoQuotes onBack={() => go("home")} onNew={() => go("video-new")} onAccept={() => { setSelectedService(SERVICES[2]); setBookingStep(0); go("time"); }} />}
        {screen === "video-new" && <VideoNewRequest onBack={() => go("video-quotes")} onDone={() => go("video-quotes")} />}
        {screen === "referral" && <Referral onBack={() => go("profile")} />}

        {screen === "no-techs" && <NoTechs onRetry={() => go("home")} onLater={() => { setBookingStep(0); go("time"); }} />}
        {screen === "payment-failed" && <PaymentFailed onRetry={() => go("review")} onChange={() => go("payment")} />}
        {screen === "offline" && <Offline onRetry={() => go("home")} />}
        {screen === "location-denied" && <LocationDenied onEnable={() => go("location")} onBack={() => go("location")} />}

        {/* Bottom tab bar — only on tabs */}
        {tabActive && (
          <div className="absolute bottom-0 inset-x-0 h-16 bg-white border-t border-slate-200 flex">
            {TABS.map(t => {
              const active = tabActive === t.id;
              return (
                <button key={t.id} onClick={() => setScreen(t.id)} className="flex-1 flex flex-col items-center justify-center gap-0.5 relative">
                  <div className="relative">
                    <t.Icon size={22} color={active ? "#1366D6" : "#94A3B8"} strokeWidth={active ? 2.5 : 2} />
                    {t.badge && (
                      <span className="absolute -top-1 -end-2 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ background: "#E5484D", fontFamily: "Inter" }}>{t.badge}</span>
                    )}
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

/* ---------- Auth & onboarding ---------- */

function Splash({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center" style={{ background: "linear-gradient(180deg,#1366D6 0%,#0E4FA8 100%)" }} onClick={onContinue}>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center">
          <span style={{ fontSize: 32 }}>🔧</span>
        </div>
        <span style={{ color: "#FFF", fontWeight: 800, fontSize: 44, letterSpacing: -1 }}>Fixly</span>
      </div>
      <p className="mt-4" style={{ color: "#E8F1FE", fontSize: 16 }}>فني محترف خلال 30 دقيقة</p>
      <div className="absolute bottom-16">
        <span style={{ color: "#CFE0FB", fontSize: 12 }}>اضغط للمتابعة</span>
      </div>
    </div>
  );
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const slides = [
    { emoji: "⏱️", title: "فني محترف خلال 30 دقيقة", body: "أقرب فني موثوق في عمّان يصلك بسرعة." },
    { emoji: "💰", title: "سعر ثابت وشفاف", body: "تعرف السعر قبل الحجز — بدون مفاجآت." },
    { emoji: "🛡️", title: "ضمان 30 يوم", body: "إذا تكررت المشكلة، نعيد إصلاحها مجاناً." },
  ];
  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex justify-end p-4">
        <button onClick={onDone} style={{ color: "#475569", fontSize: 14, fontWeight: 600 }}>تخطّي</button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="w-44 h-44 rounded-full flex items-center justify-center mb-8" style={{ background: "#E8F1FE", fontSize: 88 }}>{slides[i].emoji}</div>
        <h1 style={{ fontWeight: 700, fontSize: 24 }}>{slides[i].title}</h1>
        <p className="mt-3" style={{ color: "#475569", fontSize: 15 }}>{slides[i].body}</p>
      </div>
      <div className="flex items-center justify-center gap-2 mb-6">
        {slides.map((_, idx) => (
          <div key={idx} className="h-2 rounded-full transition-all" style={{ width: idx === i ? 28 : 8, background: idx === i ? "#1366D6" : "#E2E8F0" }} />
        ))}
      </div>
      <div className="px-5 pb-8">
        <PrimaryButton onClick={() => i < 2 ? setI(i + 1) : onDone()}>{i < 2 ? "متابعة" : "ابدأ الآن"}</PrimaryButton>
      </div>
    </div>
  );
}

function PhoneEntry({ onSubmit, onBack }: { onSubmit: () => void; onBack: () => void }) {
  const [phone, setPhone] = useState("79 000 0000");
  return (
    <div className="h-full bg-white">
      <TopBar title="" onBack={onBack} />
      <div className="px-5 mt-2">
        <h1 style={{ fontWeight: 700, fontSize: 26 }}>أدخل رقم هاتفك</h1>
        <p style={{ color: "#475569", fontSize: 14 }} className="mt-2">سنرسل لك رمز التحقق عبر واتساب</p>

        <div className="mt-8 h-[52px] border border-slate-200 rounded-xl flex items-center px-4 gap-3 bg-white" dir="ltr">
          <span style={{ fontWeight: 600, color: "#0F172A" }}>+962</span>
          <span className="w-px h-6 bg-slate-200" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="flex-1 outline-none" style={{ fontFamily: "Inter", fontSize: 16, letterSpacing: 1 }} />
        </div>

        <p className="mt-4" style={{ color: "#94A3B8", fontSize: 12 }}>بالمتابعة فإنك توافق على <span style={{ color: "#1366D6", fontWeight: 600 }}>الشروط</span> و<span style={{ color: "#1366D6", fontWeight: 600 }}>سياسة الخصوصية</span>.</p>
      </div>
      <FullCTA onClick={onSubmit}>متابعة</FullCTA>
    </div>
  );
}

function OtpVerify({ otp, setOtp, resendTimer, onDone, onBack, onResend }: { otp: string; setOtp: (v: string) => void; resendTimer: number; onDone: () => void; onBack: () => void; onResend: () => void; }) {
  return (
    <div className="h-full bg-white">
      <TopBar title="" onBack={onBack} />
      <div className="px-5">
        <h1 style={{ fontWeight: 700, fontSize: 26 }}>أدخل رمز التحقق</h1>
        <p style={{ color: "#475569", fontSize: 14 }} className="mt-2">
          تم الإرسال عبر واتساب إلى <span style={{ fontFamily: "Inter", fontWeight: 600, color: "#0F172A" }} dir="ltr">+962 79 0••• ••00</span>
        </p>

        <div className="mt-8 flex gap-2.5 justify-center" dir="ltr">
          {Array.from({ length: 6 }).map((_, i) => {
            const ch = otp[i] || "";
            return (
              <div key={i} className="w-12 h-14 rounded-xl border-2 flex items-center justify-center" style={{ borderColor: ch ? "#1366D6" : "#E2E8F0", fontFamily: "Inter", fontSize: 22, fontWeight: 700, color: "#0F172A", background: ch ? "#E8F1FE" : "#FFF" }}>
                {ch}
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col items-center gap-3">
          <div className="grid grid-cols-3 gap-2 w-full max-w-xs" dir="ltr">
            {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
              <button key={i} onClick={() => {
                if (k === "⌫") setOtp(otp.slice(0, -1));
                else if (k && otp.length < 6) setOtp(otp + k);
                if (otp.length === 5 && k !== "" && k !== "⌫") setTimeout(onDone, 300);
              }} className="h-12 rounded-lg bg-slate-100 hover:bg-slate-200 active:scale-95 transition" style={{ fontFamily: "Inter", fontSize: 20, fontWeight: 600 }}>{k}</button>
            ))}
          </div>
        </div>

        <div className="mt-6 text-center">
          {resendTimer > 0 ? (
            <span style={{ color: "#475569", fontSize: 13 }}>إعادة الإرسال خلال <span style={{ fontFamily: "Inter", fontWeight: 600 }}>{resendTimer}s</span></span>
          ) : (
            <button onClick={onResend} style={{ color: "#1366D6", fontWeight: 600, fontSize: 14 }}>إعادة إرسال الرمز</button>
          )}
        </div>
      </div>
    </div>
  );
}

function Permissions({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const items = [
    { emoji: "📍", title: "فعّل الموقع", body: "نحتاج موقعك لإرسال أقرب فني." },
    { emoji: "🔔", title: "فعّل الإشعارات", body: "لإبلاغك بحالة الفني والحجز." },
  ];
  return (
    <div className="h-full bg-white flex flex-col items-center justify-center text-center px-8">
      <div className="w-44 h-44 rounded-full flex items-center justify-center mb-8" style={{ background: "#E8F1FE", fontSize: 80 }}>{items[step].emoji}</div>
      <h1 style={{ fontWeight: 700, fontSize: 22 }}>{items[step].title}</h1>
      <p className="mt-3" style={{ color: "#475569", fontSize: 15 }}>{items[step].body}</p>
      <div className="absolute bottom-8 left-5 right-5 space-y-3">
        <PrimaryButton onClick={() => step === 0 ? setStep(1) : onDone()}>السماح</PrimaryButton>
        <PrimaryButton variant="ghost" onClick={() => step === 0 ? setStep(1) : onDone()}>ليس الآن</PrimaryButton>
      </div>
    </div>
  );
}

/* ---------- Home ---------- */

function HomeScreen({ member, onPickService, onTracking, onNotifications, onSupport, onProtection, onWallet, onVideo, onOffline }: { member: boolean; onPickService: (s: typeof SERVICES[number]) => void; onTracking: () => void; onNotifications: () => void; onSupport: () => void; onProtection: () => void; onWallet: () => void; onVideo: () => void; onOffline: () => void }) {
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 700); return () => clearTimeout(t); }, []);

  if (loading) return <HomeSkeleton />;

  const ordered = [...SERVICES].sort((a, b) => Number(!isLaunch(a.id)) - Number(!isLaunch(b.id)));
  return (
    <div className="h-full overflow-y-auto pb-20">
      {/* Header */}
      <div className="px-5 pt-3 pb-4 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => notify("اختيار الموقع — خلدا، عمّان")} className="flex items-center gap-1" style={{ color: "#475569", fontSize: 12 }}>
              <MapPin size={12} /> خلدا، عمّان <ChevronDown size={14} />
            </button>
            <h1 className="mt-1" style={{ fontWeight: 700, fontSize: 22 }}>مرحباً أحمد 👋</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onOffline} aria-label="حالة الاتصال" className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
              <WifiOff size={16} color="#94A3B8" />
            </button>
            <button onClick={onNotifications} aria-label="notifications" className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center relative">
              <Bell size={18} color="#0F172A" />
              <span className="absolute top-1.5 end-1.5 w-2 h-2 rounded-full" style={{ background: "#E5484D" }} />
            </button>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={soon} className="flex-1 h-12 rounded-xl bg-slate-100 flex items-center px-4 gap-2 text-start">
            <Search size={18} color="#94A3B8" />
            <span style={{ color: "#94A3B8", fontSize: 14 }}>ابحث عن خدمة...</span>
          </button>
          <button onClick={onWallet} className="h-12 px-3 rounded-xl flex items-center gap-1.5" style={{ background: "#DCFCE7" }}>
            <Wallet size={16} color="#15803D" />
            <span style={{ color: "#15803D", fontWeight: 700, fontSize: 12 }}>رصيدك: <span style={{ fontFamily: "Inter" }}>{CREDIT_BALANCE}</span> دينار</span>
          </button>
        </div>
      </div>

      {/* Active booking banner */}
      <Section>
        <button onClick={onTracking} className="w-full">
          <Card className="p-3 flex items-center gap-3" style={{ background: "linear-gradient(95deg,#0FB5A6 0%,#0D9488 100%)" }}>
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white">⚡</div>
            <div className="flex-1 text-start">
              <div style={{ color: "#FFF", fontWeight: 700, fontSize: 14 }}>الفني خالد في الطريق</div>
              <div style={{ color: "#CFFAFE", fontSize: 12 }}>سيصل خلال <span style={{ fontFamily: "Inter", fontWeight: 700 }}>5</span> دقائق</div>
            </div>
            <ChevronLeft size={20} color="#FFF" />
          </Card>
        </button>
      </Section>

      {/* Trust strip */}
      <div className="px-5 mt-4">
        <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ background: "#E8F1FE" }}>
          {[
            { Icon: BadgeCheck, t: "فنيون معتمدون" },
            { Icon: ShieldCheck, t: "ضمان 30 يوم" },
            { Icon: Headphones, t: "دعم 24/7" },
          ].map(({ Icon, t }) => (
            <div key={t} className="flex flex-col items-center gap-1" style={{ color: "#0E4FA8" }}>
              <Icon size={18} />
              <span style={{ fontSize: 11, fontWeight: 600 }}>{t}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Services grid */}
      <Section title="الخدمات">
        <div className="grid grid-cols-2 gap-3">
          {ordered.map(s => {
            const soonSvc = !isLaunch(s.id);
            return (
              <button key={s.id} onClick={() => soonSvc ? notify("هذه الخدمة ستتوفر قريباً") : onPickService(s)} className="text-start relative">
                <Card className="p-4" style={{ opacity: soonSvc ? 0.7 : 1 }}>
                  {soonSvc && (
                    <span className="absolute top-2 end-2 px-2 py-0.5 rounded-full" style={{ background: "#E2E8F0", color: "#475569", fontSize: 10, fontWeight: 700 }}>قريباً</span>
                  )}
                  <ServiceIcon id={s.id} size={24} />
                  <div className="mt-3" style={{ fontWeight: 700, fontSize: 15 }}>{s.ar}</div>
                  <div className="mt-1 flex items-center justify-between">
                    <PriceBadge amount={s.price} />
                    <span style={{ color: "#94A3B8", fontSize: 11 }}><span style={{ fontFamily: "Inter" }}>{s.dur}</span> د</span>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Video pre-check entry */}
      <Section>
        <button onClick={onVideo} className="w-full text-start">
          <Card className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#EDE9FE", color: "#7C3AED" }}><Video size={20} /></div>
            <div className="flex-1">
              <div style={{ fontWeight: 700, fontSize: 14 }}>لست متأكداً من المشكلة؟</div>
              <div style={{ color: "#475569", fontSize: 12 }}>فحص مرئي — احصل على سعر ثابت</div>
            </div>
            <ChevronLeft size={20} color="#94A3B8" />
          </Card>
        </button>
      </Section>

      {/* Protection promo strip */}
      <Section>
        <button onClick={onProtection} className="w-full text-start">
          <Card className="p-4 flex items-center gap-3" style={{ background: "linear-gradient(95deg,#1366D6 0%,#0E4FA8 100%)" }}>
            <div className="w-12 h-12 rounded-xl bg-white/25 flex items-center justify-center text-white"><Star size={22} fill="#fff" /></div>
            <div className="flex-1">
              <div style={{ color: "#FFF", fontWeight: 700, fontSize: 14 }}>{member ? "عضو الحماية ✓" : "خطة الحماية"}</div>
              <div style={{ color: "#CFE0FB", fontSize: 12 }}>{member ? "مزاياك مفعّلة — خصم 15% على كل خدمة" : "أولوية + خصم 15% + ضمان 90 يوم"}</div>
            </div>
            <ChevronLeft size={20} color="#FFF" />
          </Card>
        </button>
      </Section>

      <Section>
        <button onClick={onSupport} className="w-full text-start">
          <Card className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#E8F1FE", color: "#1366D6" }}>
              <Headphones size={20} />
            </div>
            <div className="flex-1">
              <div style={{ fontWeight: 600, fontSize: 14 }}>دعم 24/7</div>
              <div style={{ color: "#475569", fontSize: 12 }}>نحن هنا لمساعدتك في أي وقت</div>
            </div>
            <ChevronLeft size={20} color="#94A3B8" />
          </Card>
        </button>
      </Section>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="h-full overflow-hidden pb-20 animate-pulse">
      <div className="px-5 pt-3 pb-4 bg-white">
        <div className="h-3 w-24 rounded bg-slate-200" />
        <div className="mt-2 h-6 w-40 rounded bg-slate-200" />
        <div className="mt-4 h-12 w-full rounded-xl bg-slate-100" />
      </div>
      <div className="px-5 mt-5"><div className="h-16 rounded-2xl bg-slate-100" /></div>
      <div className="px-5 mt-5 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-slate-100" />)}
      </div>
    </div>
  );
}

/* ---------- Service detail ---------- */

function ServiceDetail({ svc, onBack, onBook, onVideo }: { svc: typeof SERVICES[number]; onBack: () => void; onBook: () => void; onVideo: () => void }) {
  const [pkg, setPkg] = useState(0);
  const packages = [
    { name: "إصلاح", note: "إصلاح عطل قائم" },
    { name: "تركيب", note: "تركيب قطعة جديدة" },
  ];
  return (
    <div className="h-full bg-white relative">
      <TopBar title={svc.ar} onBack={onBack} />
      <div className="overflow-y-auto pb-32 h-full">
        <div className="px-5 pt-6 flex items-center gap-4">
          <ServiceIcon id={svc.id} size={32} />
          <div className="flex-1">
            <h1 style={{ fontWeight: 700, fontSize: 22 }}>{svc.ar}</h1>
            <div style={{ color: "#475569", fontSize: 13 }} className="mt-1">المدة المتوقعة: <span style={{ fontFamily: "Inter", fontWeight: 600 }}>{svc.dur}</span> دقيقة</div>
          </div>
        </div>

        <div className="mx-5 mt-5 p-5 rounded-2xl" style={{ background: "#E8F1FE" }}>
          <div style={{ color: "#0E4FA8", fontSize: 13, fontWeight: 600 }}>السعر الثابت</div>
          <div className="mt-1"><PriceBadge amount={svc.price} big /></div>
          <div className="mt-2" style={{ color: "#0E4FA8", fontSize: 12 }}>لا مفاجآت — السعر شامل الفحص واليد العاملة</div>
        </div>

        {/* Package options */}
        <Section title="نوع الخدمة">
          <div className="grid grid-cols-2 gap-3">
            {packages.map((p, i) => (
              <button key={p.name} onClick={() => setPkg(i)} className="text-start">
                <Card className="p-4" style={{ borderColor: pkg === i ? "#1366D6" : "transparent", borderWidth: 2 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
                  <div style={{ color: "#475569", fontSize: 12 }} className="mt-1">{p.note}</div>
                </Card>
              </button>
            ))}
          </div>
        </Section>

        <Section title="يشمل السعر">
          <ul className="space-y-2.5">
            {["فحص شامل من فني معتمد", "إصلاح المشكلة الأساسية", "اختبار التشغيل بعد الإصلاح", "ضمان 30 يوم على العمل"].map(t => (
              <li key={t} className="flex items-center gap-2" style={{ fontSize: 14 }}>
                <CheckCircle2 size={18} color="#1FAA59" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="لا يشمل السعر">
          <ul className="space-y-2.5">
            {["قطع الغيار والمواد (بموافقتك المسبقة)", "أعمال إضافية خارج نطاق الخدمة", "أضرار موجودة مسبقاً في المكان"].map(t => (
              <li key={t} className="flex items-center gap-2" style={{ fontSize: 14, color: "#475569" }}>
                <X size={18} color="#E5484D" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Callout fee note */}
        <Section>
          <Card className="p-3 flex items-start gap-2.5" style={{ background: "#FEF3C7" }}>
            <AlertCircle size={18} color="#B45309" />
            <p style={{ color: "#92400E", fontSize: 13 }}>رسوم كشف <span style={{ fontFamily: "Inter", fontWeight: 700 }}>5</span> دنانير تُخصم من قيمة الإصلاح عند المتابعة.</p>
          </Card>
        </Section>

        {/* Video pre-check entry */}
        <Section>
          <button onClick={onVideo} className="w-full text-start">
            <Card className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#EDE9FE", color: "#7C3AED" }}><Video size={20} /></div>
              <div className="flex-1">
                <div style={{ fontWeight: 700, fontSize: 14 }}>فحص مرئي؟ احصل على سعر ثابت</div>
                <div style={{ color: "#475569", fontSize: 12 }}>للحالات غير المؤكدة — أرسل فيديو للمشكلة</div>
              </div>
              <ChevronLeft size={18} color="#94A3B8" />
            </Card>
          </button>
        </Section>

        <Section title="ملاحظة">
          <Card className="p-3 flex items-start gap-2.5" style={{ background: "#DCFCE7" }}>
            <ShieldCheck size={18} color="#15803D" />
            <p style={{ color: "#166534", fontSize: 13 }}>إذا تكررت المشكلة خلال 30 يوم، نعيد الإصلاح مجاناً أو نسترد المبلغ.</p>
          </Card>
        </Section>
      </div>
      <FullCTA onClick={onBook}>اطلب الآن</FullCTA>
    </div>
  );
}

/* ---------- Booking flow ---------- */

function BookingHeader({ step, onBack, title }: { step: number; onBack: () => void; title: string }) {
  return (
    <div className="bg-white">
      <TopBar title={title} onBack={onBack} />
      <div className="px-5 py-3 flex items-center justify-between">
        <StepIndicator step={step} total={4} />
        <span style={{ color: "#475569", fontSize: 12 }}><span style={{ fontFamily: "Inter", fontWeight: 600 }}>{step + 1}/4</span></span>
      </div>
    </div>
  );
}

function TimeStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [mode, setMode] = useState<"now" | "later">("now");
  return (
    <div className="h-full bg-white relative">
      <BookingHeader step={0} onBack={onBack} title="موعد الخدمة" />
      <div className="px-5 mt-5 space-y-3">
        <button onClick={() => setMode("now")} className="w-full text-start">
          <Card className="p-4 flex items-center gap-3" style={{ borderColor: mode === "now" ? "#1366D6" : "transparent", borderWidth: 2 }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#E8F1FE", color: "#1366D6" }}>⚡</div>
            <div className="flex-1">
              <div style={{ fontWeight: 700, fontSize: 15 }}>فوراً (خلال 30 دقيقة)</div>
              <div style={{ color: "#475569", fontSize: 12 }}>الفني الأقرب يصلك مباشرةً</div>
            </div>
            <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: mode === "now" ? "#1366D6" : "#CBD5E1" }}>
              {mode === "now" && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#1366D6" }} />}
            </div>
          </Card>
        </button>
        <button onClick={() => setMode("later")} className="w-full text-start">
          <Card className="p-4 flex items-center gap-3" style={{ borderColor: mode === "later" ? "#1366D6" : "transparent", borderWidth: 2 }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "#FEF3C7", color: "#B45309" }}><Calendar size={22} /></div>
            <div className="flex-1">
              <div style={{ fontWeight: 700, fontSize: 15 }}>حجز لاحقاً</div>
              <div style={{ color: "#475569", fontSize: 12 }}>اختر التاريخ والوقت المناسبين</div>
            </div>
            <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: mode === "later" ? "#1366D6" : "#CBD5E1" }}>
              {mode === "later" && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#1366D6" }} />}
            </div>
          </Card>
        </button>

        {mode === "later" && (
          <Card className="p-4 mt-2">
            <div className="grid grid-cols-3 gap-2">
              {["اليوم", "غداً", "السبت"].map((d, i) => (
                <div key={d} className="text-center py-3 rounded-lg border" style={{ borderColor: i === 0 ? "#1366D6" : "#E2E8F0", background: i === 0 ? "#E8F1FE" : "#FFF" }}>
                  <div style={{ fontSize: 12, color: "#475569" }}>{d}</div>
                  <div style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 18, color: i === 0 ? "#1366D6" : "#0F172A" }}>{8 + i}</div>
                  <div style={{ fontSize: 10, color: "#94A3B8" }}>يونيو</div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {["10:00 ص","11:30 ص","2:00 م","4:30 م","6:00 م","7:30 م"].map((t, i) => (
                <div key={t} className="text-center py-2 rounded-lg border" style={{ borderColor: i === 2 ? "#1366D6" : "#E2E8F0", background: i === 2 ? "#E8F1FE" : "#FFF", fontSize: 12, fontWeight: 600, color: i === 2 ? "#1366D6" : "#0F172A" }}>{t}</div>
              ))}
            </div>
          </Card>
        )}
      </div>
      <FullCTA onClick={onNext}>متابعة</FullCTA>
    </div>
  );
}

function LocationStep({ onBack, onNext, onDenied }: { onBack: () => void; onNext: () => void; onDenied: () => void }) {
  return (
    <div className="h-full bg-white relative">
      <BookingHeader step={1} onBack={onBack} title="حدد الموقع" />
      <div className="relative">
        <MapMock height={300} customerLabel="اسحب لتحديد موقعك" />
        <div className="absolute top-3 inset-x-5 flex justify-between">
          <button onClick={() => notify("تم تثبيت الدبوس على موقعك")} className="px-3 py-1.5 rounded-full bg-white shadow text-[12px] font-semibold" style={{ color: "#1366D6" }}>حدد موقعك</button>
          <button onClick={onDenied} className="px-3 py-1.5 rounded-full bg-white shadow text-[12px] font-semibold" style={{ color: "#E5484D" }}>الموقع مرفوض؟</button>
        </div>
      </div>
      <div className="px-5 pt-4 space-y-3 overflow-y-auto" style={{ maxHeight: 280 }}>
        <div className="flex items-center gap-2 p-3 rounded-xl border border-slate-200">
          <MapPin size={18} color="#1366D6" />
          <span style={{ fontSize: 14 }}>خلدا، شارع وصفي التل، عمارة 12، ط2</span>
        </div>
        <input placeholder="رقم العمارة / الشقة" className="w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14 }} defaultValue="عمارة 12، شقة 5" />
        <textarea placeholder="ملاحظات (مثال: رمز البوابة 1234)" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none resize-none" rows={2} style={{ fontSize: 14 }} defaultValue="رمز البوابة 1234، شقة في الطابق الثاني" />
      </div>
      <FullCTA onClick={onNext}>متابعة</FullCTA>
    </div>
  );
}

function PaymentStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [sel, setSel] = useState("apple");
  const methods = [
    { id: "apple", icon: <Apple size={22} />, name: "Apple Pay", note: "الدفع السريع" },
    { id: "google", icon: <span style={{ fontWeight: 800, fontSize: 16 }}>G</span>, name: "Google Pay", note: "الدفع السريع" },
    { id: "card1", icon: <CreditCard size={22} color="#1366D6" />, name: "Visa •••• 4242", note: "بطاقة محفوظة" },
  ];
  return (
    <div className="h-full bg-white relative">
      <BookingHeader step={2} onBack={onBack} title="طريقة الدفع" />
      <div className="px-5 mt-5 space-y-2.5">
        {methods.map(m => (
          <button key={m.id} onClick={() => setSel(m.id)} className="w-full text-start">
            <Card className="p-4 flex items-center gap-3" style={{ borderColor: sel === m.id ? "#1366D6" : "transparent", borderWidth: 2 }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "#F1F5F9" }}>{m.icon}</div>
              <div className="flex-1">
                <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div>
                <div style={{ color: "#475569", fontSize: 12 }}>{m.note}</div>
              </div>
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: sel === m.id ? "#1366D6" : "#CBD5E1" }}>
                {sel === m.id && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#1366D6" }} />}
              </div>
            </Card>
          </button>
        ))}
        <button onClick={soon} className="w-full p-3 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center gap-2" style={{ color: "#1366D6", fontWeight: 600, fontSize: 14 }}>
          <Plus size={18} /> إضافة بطاقة جديدة
        </button>
      </div>
      <div className="absolute bottom-24 inset-x-5 p-3 rounded-xl flex items-center gap-2" style={{ background: "#E8F1FE" }}>
        <ShieldCheck size={18} color="#1366D6" />
        <span style={{ color: "#0E4FA8", fontSize: 12, fontWeight: 600 }}>دفع آمن 100% — لا دفع نقدي للفني</span>
      </div>
      <FullCTA onClick={onNext}>متابعة</FullCTA>
    </div>
  );
}

function ReviewStep({ svc, member, onBack, onConfirm, onFail }: { svc: typeof SERVICES[number]; member: boolean; onBack: () => void; onConfirm: () => void; onFail: () => void }) {
  const [promo, setPromo] = useState("");
  const [applied, setApplied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [handoff, setHandoff] = useState(false);

  const callout = 5;
  const memberDiscount = member ? Math.round(svc.price * 0.15) : 0;
  const promoDiscount = applied ? 5 : 0;
  const creditApplied = Math.min(CREDIT_BALANCE, Math.max(0, svc.price + callout - memberDiscount - promoDiscount));
  const total = Math.max(0, svc.price + callout - memberDiscount - promoDiscount - creditApplied);

  const doPay = () => {
    setConfirming(false);
    setHandoff(true);
    // Simulate secure payment handoff → success. (Failure path reachable via button.)
    setTimeout(() => { setHandoff(false); onConfirm(); }, 1400);
  };

  return (
    <div className="h-full bg-white relative">
      <BookingHeader step={3} onBack={onBack} title="مراجعة وتأكيد" />
      <div className="px-5 mt-4 space-y-3 overflow-y-auto pb-36" style={{ maxHeight: "calc(100% - 200px)" }}>
        <Card className="p-4 flex items-center gap-3">
          <ServiceIcon id={svc.id} size={22} />
          <div className="flex-1">
            <div style={{ fontWeight: 700, fontSize: 15 }}>{svc.ar}</div>
            <div style={{ color: "#475569", fontSize: 12 }}><span style={{ fontFamily: "Inter" }}>{svc.dur}</span> دقيقة</div>
          </div>
          <PriceBadge amount={svc.price} />
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <Clock size={16} color="#475569" />
            <span style={{ fontSize: 14 }}>فوراً — خلال 30 دقيقة</span>
          </div>
          <div className="h-px bg-slate-100" />
          <div className="flex items-start gap-2.5">
            <MapPin size={16} color="#475569" />
            <span style={{ fontSize: 14 }}>خلدا، شارع وصفي التل، عمارة 12، ط2</span>
          </div>
          <div className="h-px bg-slate-100" />
          <div className="flex items-center gap-2.5">
            <CreditCard size={16} color="#475569" />
            <span style={{ fontSize: 14 }}>Apple Pay</span>
          </div>
        </Card>

        {member && (
          <Card className="p-3 flex items-center gap-2" style={{ background: "#E8F1FE" }}>
            <Star size={16} color="#1366D6" fill="#1366D6" />
            <span style={{ color: "#0E4FA8", fontSize: 12, fontWeight: 600 }}>عضو الحماية — خصم العضوية −15% مُطبّق</span>
          </Card>
        )}

        <Card className="p-4">
          <div style={{ fontSize: 13, fontWeight: 600, color: "#475569" }} className="mb-2">أدخل رمز الخصم</div>
          <div className="flex gap-2">
            <input value={promo} onChange={(e) => setPromo(e.target.value)} placeholder="FIXLY20" className="flex-1 h-11 rounded-lg border border-slate-200 px-3 outline-none" style={{ fontSize: 14, fontFamily: "Inter" }} />
            <button onClick={() => { if (promo.trim()) { setApplied(true); notify("تم تطبيق رمز الخصم", "success"); } }} className="px-4 rounded-lg" style={{ background: applied ? "#DCFCE7" : "#1366D6", color: applied ? "#15803D" : "#FFF", fontWeight: 600, fontSize: 13 }}>{applied ? "✓ مُطبَّق" : "تطبيق"}</button>
          </div>
        </Card>

        <Card className="p-4">
          <InlineRow label="سعر الخدمة" value={`${svc.price} دينار`} />
          <InlineRow label="رسوم الكشف" value={`${callout} دينار`} />
          {member && <InlineRow label="خصم العضوية −15%" value={<span style={{ color: "#1FAA59" }}>−{memberDiscount} دينار</span>} />}
          {applied && <InlineRow label={`خصم ${promo || "FIXLY20"}`} value={<span style={{ color: "#1FAA59" }}>−{promoDiscount} دينار</span>} />}
          {creditApplied > 0 && <InlineRow label="خصم رصيدك (تلقائي)" value={<span style={{ color: "#1FAA59" }}>−{creditApplied} دينار</span>} />}
          <div className="h-px bg-slate-100 my-1" />
          <InlineRow strong label="الإجمالي للدفع" value={`${total} دينار`} />
        </Card>

        <Card className="p-3 flex items-start gap-2.5" style={{ background: "#E8F1FE" }}>
          <ShieldCheck size={18} color="#1366D6" />
          <p style={{ color: "#0E4FA8", fontSize: 12 }}>سيتم حجز مبلغ <span style={{ fontFamily: "Inter", fontWeight: 700 }}>{total}</span> دينار الآن ويُخصم بعد إتمام الخدمة. ضمان 30 يوم مشمول.</p>
        </Card>
      </div>
      <FullCTA onClick={() => setConfirming(true)}>تأكيد الحجز — <span style={{ fontFamily: "Inter" }}>{total}</span> دينار</FullCTA>
      {confirming && (
        <ConfirmDialog
          title="تأكيد الحجز"
          body={`سيتم حجز ${total} دينار عبر Apple Pay وخصمه بعد إتمام الخدمة.`}
          confirmLabel="تأكيد والدفع"
          onConfirm={doPay}
          onCancel={() => setConfirming(false)}
        />
      )}
      {handoff && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4" style={{ background: "rgba(255,255,255,0.96)" }}>
          <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-[#1366D6] animate-spin" />
          <p style={{ color: "#475569", fontSize: 14 }}>جارٍ فتح صفحة الدفع الآمنة…</p>
          <button onClick={onFail} style={{ color: "#94A3B8", fontSize: 12 }}>محاكاة: فشل الدفع</button>
        </div>
      )}
    </div>
  );
}

/* ---------- Searching ---------- */

function Searching({ onAssign, onCancel, onNoTechs }: { onAssign: () => void; onCancel: () => void; onNoTechs: () => void }) {
  return (
    <div className="h-full bg-white flex flex-col items-center justify-center px-8 text-center">
      <div className="relative w-48 h-48 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full animate-ping" style={{ background: "#1366D6", opacity: 0.1 }} />
        <div className="absolute inset-4 rounded-full animate-ping" style={{ background: "#1366D6", opacity: 0.15, animationDelay: "0.3s" }} />
        <div className="absolute inset-10 rounded-full animate-pulse" style={{ background: "#1366D6", opacity: 0.2 }} />
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: "#1366D6" }}>
          <span style={{ fontSize: 36 }}>🔧</span>
        </div>
      </div>
      <h1 className="mt-6" style={{ fontWeight: 700, fontSize: 22 }}>نبحث عن أقرب فني...</h1>
      <p className="mt-2" style={{ color: "#475569", fontSize: 14 }}>عادة يستغرق هذا أقل من دقيقة</p>

      <div className="absolute bottom-8 inset-x-5 space-y-3">
        <PrimaryButton variant="outline" onClick={onAssign}>محاكاة: تم العثور على فني</PrimaryButton>
        <PrimaryButton variant="ghost" onClick={onNoTechs}>محاكاة: لا يوجد فنيون</PrimaryButton>
        <PrimaryButton variant="destructive" onClick={onCancel}>إلغاء البحث</PrimaryButton>
      </div>
    </div>
  );
}

/* ---------- Live tracking ---------- */

/* ---------- Technician assigned (trust moment) ---------- */

function CertifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "#E8F1FE", color: "#1366D6", fontSize: 11, fontWeight: 700 }}>
      <BadgeCheck size={12} /> فني معتمد
    </span>
  );
}
function TrustTierChip() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "#EDE9FE", color: "#7C3AED", fontSize: 11, fontWeight: 700 }}>
      <Award size={12} /> محترف
    </span>
  );
}

function TechnicianAssigned({ svc, onTrack, onReviews, onCancel }: { svc: typeof SERVICES[number]; onTrack: () => void; onReviews: () => void; onCancel: () => void }) {
  return (
    <div className="h-full bg-white relative">
      <TopBar title="تم العثور على فني" onBack={onCancel} />
      <div className="px-5 mt-4 overflow-y-auto pb-32" style={{ height: "calc(100% - 56px)" }}>
        <Card className="p-5 text-center">
          <div className="flex justify-center"><Avatar name="خالد المومني" size={72} verified /></div>
          <h2 className="mt-3" style={{ fontWeight: 700, fontSize: 20 }}>خالد المومني</h2>
          <div className="mt-2 flex items-center justify-center gap-2">
            <CertifiedBadge />
            <TrustTierChip />
          </div>
          <div className="mt-3 flex items-center justify-center gap-3">
            <Stars rating={4.9} size={14} />
            <span style={{ color: "#94A3B8", fontSize: 12 }}>· <span style={{ fontFamily: "Inter" }}>320</span> خدمة</span>
          </div>
          <div style={{ color: "#475569", fontSize: 12 }} className="mt-2">تويوتا كورولا · أبيض · <span style={{ fontFamily: "Inter" }}>34-12345</span></div>
        </Card>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => notify("تشغيل الفيديو التعريفي…")} className="text-start">
            <Card className="p-3 flex items-center gap-2">
              <PlayCircle size={20} color="#7C3AED" />
              <span style={{ fontSize: 13, fontWeight: 600 }}>الفيديو التعريفي</span>
            </Card>
          </button>
          <button onClick={() => notify("عرض الشهادات والتراخيص…")} className="text-start">
            <Card className="p-3 flex items-center gap-2">
              <FileText size={20} color="#1366D6" />
              <span style={{ fontSize: 13, fontWeight: 600 }}>الشهادات</span>
            </Card>
          </button>
        </div>

        <button onClick={onReviews} className="w-full mt-3 text-start">
          <Card className="p-4 flex items-center gap-3">
            <Star size={20} color="#F5A623" fill="#F5A623" />
            <span className="flex-1" style={{ fontSize: 14, fontWeight: 600 }}>عرض التقييمات</span>
            <ChevronLeft size={18} color="#94A3B8" />
          </Card>
        </button>

        <Card className="mt-3 p-3 flex items-center gap-2" style={{ background: "#CCFBF1" }}>
          <ShieldCheck size={18} color="#0F766E" />
          <span style={{ color: "#0F766E", fontSize: 12, fontWeight: 600 }}>{svc.ar} — الفني في الطريق إليك</span>
        </Card>
      </div>
      <FullCTA onClick={onTrack}>تتبع الفني مباشرةً</FullCTA>
    </div>
  );
}

function TechnicianReviews({ onBack }: { onBack: () => void }) {
  const reviews = [
    { name: "سارة خالد", r: 5, t: "فني محترف وسريع، أنجز العمل بإتقان.", d: "02/06/2026" },
    { name: "محمد الزعبي", r: 5, t: "التزم بالموعد والسعر تماماً. شكراً.", d: "28/05/2026" },
    { name: "رنا حدّاد", r: 4, t: "خدمة جيدة، تأخر قليلاً لكنه اعتذر.", d: "19/05/2026" },
  ];
  return (
    <div className="h-full bg-white">
      <TopBar title="تقييمات خالد" onBack={onBack} />
      <div className="px-5 mt-3 overflow-y-auto pb-8" style={{ height: "calc(100% - 56px)" }}>
        <Card className="p-4 flex items-center gap-4">
          <div className="text-center">
            <div style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 32, color: "#0F172A" }}>4.9</div>
            <Stars rating={4.9} size={12} />
          </div>
          <div className="flex-1">
            <div style={{ color: "#475569", fontSize: 12 }}>بناءً على <span style={{ fontFamily: "Inter" }}>320</span> خدمة</div>
          </div>
        </Card>
        <div className="mt-3 space-y-3">
          {reviews.map((rv, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center gap-2">
                <Avatar name={rv.name} size={32} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{rv.name}</span>
                    <span className="px-1.5 py-0.5 rounded" style={{ background: "#DCFCE7", color: "#15803D", fontSize: 10, fontWeight: 700 }}>تقييم موثّق</span>
                  </div>
                  <Stars rating={rv.r} size={11} />
                </div>
                <span style={{ color: "#94A3B8", fontSize: 11, fontFamily: "Inter" }}>{rv.d}</span>
              </div>
              <p style={{ color: "#475569", fontSize: 13 }} className="mt-2">{rv.t}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportTechnician({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(-1);
  const reasons = ["محاولة تعامل خارج التطبيق", "لم يحضر", "جودة سيئة", "سلوك / سلامة", "أخرى"];
  return (
    <div className="h-full bg-white relative">
      <TopBar title="الإبلاغ عن مشكلة" onBack={onBack} />
      <div className="px-5 mt-3 space-y-2">
        <p style={{ color: "#475569", fontSize: 13 }} className="mb-1">سبب البلاغ</p>
        {reasons.map((r, i) => (
          <button key={r} onClick={() => setReason(i)} className="w-full text-start">
            <Card className="p-4 flex items-center" style={{ borderColor: reason === i ? "#1366D6" : "transparent", borderWidth: 2 }}>
              <span className="flex-1" style={{ fontSize: 14 }}>{r}</span>
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: reason === i ? "#1366D6" : "#CBD5E1" }}>
                {reason === i && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#1366D6" }} />}
              </div>
            </Card>
          </button>
        ))}
        <textarea placeholder="تفاصيل إضافية (اختياري)" className="w-full mt-2 rounded-xl border border-slate-200 px-4 py-3 outline-none resize-none" rows={3} style={{ fontSize: 14 }} />
        <Card className="p-3 flex items-start gap-2" style={{ background: "#FEF3C7" }}>
          <AlertCircle size={16} color="#B45309" />
          <p style={{ color: "#92400E", fontSize: 12 }}>أبقِ التعامل داخل التطبيق — الضمان والرصيد صالحان فقط للحجوزات داخل Fixly.</p>
        </Card>
      </div>
      <FullCTA onClick={() => { if (reason < 0) { notify("اختر سبب البلاغ"); return; } notify("تم استلام بلاغك، سيراجعه فريقنا", "success"); onDone(); }}>إرسال البلاغ</FullCTA>
    </div>
  );
}

/* ---------- Arrived + late-compensation ---------- */

function Arrived({ onInProgress, onWallet, onBack }: { onInProgress: () => void; onWallet: () => void; onBack: () => void }) {
  return (
    <div className="h-full bg-white relative">
      <TopBar title="وصل الفني" onBack={onBack} />
      <div className="px-5 pt-4 text-center overflow-y-auto pb-28" style={{ height: "calc(100% - 56px)" }}>
        <StatusBadge status="arrived" />
        <div className="mt-6 w-32 h-32 mx-auto rounded-full flex items-center justify-center" style={{ background: "#CCFBF1" }}>
          <MapPin size={64} color="#0F766E" />
        </div>
        <h1 className="mt-5" style={{ fontWeight: 700, fontSize: 22 }}>الفني وصل</h1>
        <p style={{ color: "#475569", fontSize: 14 }} className="mt-2">خالد المومني عند بابك الآن.</p>

        {/* Late-compensation banner */}
        <button onClick={onWallet} className="w-full text-start mt-6">
          <Card className="p-4 flex items-start gap-3" style={{ background: "#DCFCE7" }}>
            <Gift size={24} color="#15803D" />
            <div>
              <div style={{ color: "#15803D", fontWeight: 700, fontSize: 14 }}>تأخر الفني</div>
              <p style={{ color: "#166534", fontSize: 13 }} className="mt-0.5">تم إضافة <span style={{ fontFamily: "Inter", fontWeight: 700 }}>20</span> دينار إلى رصيدك تلقائياً كتعويض. اضغط لعرض المحفظة.</p>
            </div>
          </Card>
        </button>
      </div>
      <FullCTA onClick={onInProgress}>بدء الخدمة</FullCTA>
    </div>
  );
}

function LiveTracking({ svc, onCancel, onArrived, onInProgress, onBack, onReport, onReviews }: { svc: typeof SERVICES[number]; onCancel: () => void; onArrived: () => void; onInProgress: () => void; onBack: () => void; onReport: () => void; onReviews: () => void; }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="h-full relative">
      <div className="absolute top-0 inset-x-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200">
        <TopBar title="تتبع الفني" onBack={onBack} right={
          <button onClick={() => setMenu(m => !m)} aria-label="المزيد" className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center"><MoreVertical size={18} /></button>
        } />
        {menu && (
          <div className="absolute end-3 top-14 z-30 bg-white rounded-xl shadow-lg border border-slate-100 overflow-hidden">
            <button onClick={() => { setMenu(false); onReport(); }} className="px-4 py-3 flex items-center gap-2 w-44 text-start" style={{ fontSize: 13, color: "#E5484D" }}>
              <Flag size={16} /> الإبلاغ عن مشكلة
            </button>
          </div>
        )}
      </div>
      <div className="pt-14 h-full flex flex-col">
        <div className="flex-1 relative">
          <MapMock showRoute showTechPin techLabel="خالد" customerLabel="عنوانك" height={420} />
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-white rounded-full px-4 py-2 shadow-md flex items-center gap-1">
            <span style={{ color: "#0F766E", fontWeight: 700, fontFamily: "Inter", fontSize: 16 }}>5</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#0F766E" }}>دقائق</span>
          </div>
        </div>

        <div className="bg-white rounded-t-3xl -mt-6 z-10 relative shadow-2xl px-5 pt-3 pb-4">
          <div className="w-9 h-1 rounded-full bg-slate-300 mx-auto mb-3" />
          <div className="flex items-center justify-between">
            <StatusBadge status="technician_arriving" />
            <GuaranteePill />
          </div>

          {/* Status stepper */}
          <div className="mt-4 flex items-center gap-2">
            {["تم القبول", "في الطريق", "وصل", "اكتمل"].map((s, i) => (
              <div key={s} className="flex-1 text-center">
                <div className="h-1.5 rounded-full" style={{ background: i <= 1 ? "#0FB5A6" : "#E2E8F0" }} />
                <div className="mt-1.5" style={{ fontSize: 10, color: i <= 1 ? "#0F766E" : "#94A3B8", fontWeight: 600 }}>{s}</div>
              </div>
            ))}
          </div>

          <button onClick={onReviews} className="mt-4 w-full flex items-center gap-3 text-start">
            <Avatar name="خالد المومني" size={48} verified />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span style={{ fontWeight: 700, fontSize: 15 }}>خالد المومني</span>
                <CertifiedBadge />
                <TrustTierChip />
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <Stars rating={4.9} size={12} />
                <span style={{ color: "#94A3B8", fontSize: 11 }}>· <span style={{ fontFamily: "Inter" }}>320</span> خدمة · عرض التقييمات ›</span>
              </div>
              <div style={{ color: "#475569", fontSize: 11 }} className="mt-0.5">تويوتا كورولا · أبيض · <span style={{ fontFamily: "Inter" }}>34-12345</span></div>
            </div>
          </button>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button onClick={() => notify("جارٍ الاتصال المُقنّع بالفني — 079 0••• ••00")} className="h-11 rounded-xl border border-slate-200 flex items-center justify-center gap-1.5" style={{ fontSize: 13, fontWeight: 600 }}>
              <Phone size={16} color="#1366D6" /> اتصال
            </button>
            <button onClick={() => notify("فتح محادثة مع خالد…")} className="h-11 rounded-xl border border-slate-200 flex items-center justify-center gap-1.5" style={{ fontSize: 13, fontWeight: 600 }}>
              <MessageCircle size={16} color="#1366D6" /> رسالة
            </button>
            <button onClick={onCancel} className="h-11 rounded-xl flex items-center justify-center gap-1.5" style={{ fontSize: 13, fontWeight: 600, color: "#E5484D", background: "#FEE2E2" }}>
              <X size={16} /> إلغاء
            </button>
          </div>
          <p style={{ color: "#94A3B8", fontSize: 11 }} className="mt-2 text-center">الإلغاء مجاني قبل انطلاق الفني؛ قد تُطبّق رسوم إلغاء بعد ذلك.</p>

          <div className="mt-3 p-3 rounded-xl flex items-center gap-2" style={{ background: "#F1F5F9" }}>
            <ServiceIcon id={svc.id} size={18} />
            <div className="flex-1">
              <div style={{ fontSize: 13, fontWeight: 600 }}>{svc.ar}</div>
              <div style={{ color: "#475569", fontSize: 11 }}>الرقم #FX-20603</div>
            </div>
            <PriceBadge amount={svc.price} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={onArrived} className="text-xs px-2 py-2 rounded-lg" style={{ background: "#CCFBF1", color: "#0F766E", fontWeight: 600 }}>محاكاة: وصل الفني</button>
            <button onClick={onInProgress} className="text-xs px-2 py-2 rounded-lg" style={{ background: "#FEF3C7", color: "#B45309", fontWeight: 600 }}>محاكاة: بدأ العمل</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CancelFlow({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const reasons = ["وصل الفني متأخراً", "غيّرت رأيي", "خطأ في الطلب", "أخرى"];
  return (
    <div className="h-full bg-white relative">
      <TopBar title="إلغاء الحجز" onBack={onBack} />
      <div className="px-5 mt-3 space-y-2">
        <p style={{ color: "#475569", fontSize: 13 }} className="mb-2">سبب الإلغاء</p>
        {reasons.map((r, i) => (
          <button key={r} onClick={() => setReason(i)} className="w-full text-start">
            <Card className="p-4 flex items-center" style={{ borderColor: reason === i ? "#1366D6" : "transparent", borderWidth: 2 }}>
              <span className="flex-1" style={{ fontSize: 14 }}>{r}</span>
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: reason === i ? "#1366D6" : "#CBD5E1" }}>
                {reason === i && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#1366D6" }} />}
              </div>
            </Card>
          </button>
        ))}
      </div>
      <div className="px-5 mt-4">
        <Card className="p-4" style={{ background: "#FEF3C7" }}>
          <div style={{ color: "#B45309", fontWeight: 700, fontSize: 13 }}>ملخص الاسترداد</div>
          <InlineRow label="المبلغ المحجوز" value="50 دينار" />
          <InlineRow label="رسوم الإلغاء" value="0 دينار" />
          <div className="h-px bg-amber-200 my-1" />
          <InlineRow strong label="المبلغ المسترد" value={<span style={{ color: "#15803D" }}>50 دينار</span>} />
        </Card>
      </div>
      <FullCTA variant="destructive" onClick={() => setConfirming(true)}>تأكيد الإلغاء</FullCTA>
      {confirming && (
        <ConfirmDialog
          title="تأكيد الإلغاء"
          body="هل تريد إلغاء هذا الحجز؟ سيتم استرداد المبلغ كاملاً."
          confirmLabel="نعم، إلغاء الحجز"
          variant="destructive"
          onConfirm={onDone}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

function InProgress({ onApprove, onDone }: { onApprove: () => void; onDone: () => void }) {
  return (
    <div className="h-full bg-white relative">
      <TopBar title="الخدمة جارية" />
      <div className="px-5 pt-4 text-center">
        <StatusBadge status="in_progress" />
        <div className="mt-6 w-36 h-36 mx-auto rounded-full flex items-center justify-center" style={{ background: "#FEF3C7" }}>
          <span style={{ fontSize: 56 }}>🛠️</span>
        </div>
        <h1 className="mt-5" style={{ fontWeight: 700, fontSize: 22 }}>الفني يعمل الآن</h1>
        <p style={{ color: "#475569", fontSize: 14 }} className="mt-2">بدأ العمل في 3:42 م</p>
        <Card className="mt-6 p-4 text-start">
          <div className="flex items-center gap-3">
            <Avatar name="خالد المومني" verified />
            <div className="flex-1">
              <div style={{ fontWeight: 700, fontSize: 14 }}>خالد المومني</div>
              <Stars rating={4.9} size={12} />
            </div>
            <button onClick={() => notify("جارٍ الاتصال بالفني خالد…")} aria-label="اتصال">
              <Phone size={18} color="#1366D6" />
            </button>
          </div>
        </Card>

        <button onClick={onApprove} className="w-full mt-5 p-4 rounded-2xl text-start border-2 border-dashed" style={{ borderColor: "#F5A623", background: "#FFFBEB" }}>
          <div className="flex items-center gap-2">
            <AlertCircle size={18} color="#B45309" />
            <span style={{ color: "#B45309", fontWeight: 700, fontSize: 13 }}>طلب اعتماد عمل إضافي</span>
          </div>
          <p style={{ color: "#92400E", fontSize: 12 }} className="mt-1">أضاف الفني بنداً جديداً — اضغط للمراجعة</p>
        </button>
      </div>
      <FullCTA onClick={onDone}>محاكاة: اكتمال الخدمة</FullCTA>
    </div>
  );
}

function ApproveWork({ onBack, onApproved }: { onBack: () => void; onApproved: () => void }) {
  return (
    <div className="h-full bg-white relative">
      <TopBar title="عمل إضافي" onBack={onBack} />
      <div className="px-5 mt-3">
        <p style={{ color: "#475569", fontSize: 13 }}>أضاف الفني خالد البنود التالية:</p>
        <Card className="mt-3 p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 14 }}>استبدال مفتاح الإضاءة</span>
            <span style={{ fontFamily: "Inter", fontWeight: 700 }}>15 دينار</span>
          </div>
          <div className="h-px bg-slate-100" />
          <InlineRow label="الخدمة الأساسية" value="50 دينار" />
          <InlineRow label="عمل إضافي" value="15 دينار" />
          <div className="h-px bg-slate-100" />
          <InlineRow strong label="الإجمالي الجديد" value="65 دينار" />
        </Card>

        <div className="mt-4 p-3 rounded-xl" style={{ background: "#E8F1FE" }}>
          <p style={{ color: "#0E4FA8", fontSize: 12 }}>لن تتم إضافة أي مبلغ دون موافقتك. يمكنك رفض العمل الإضافي.</p>
        </div>
      </div>
      <div className="absolute bottom-0 inset-x-0 px-5 pt-3 pb-6 bg-white border-t border-slate-100 space-y-2">
        <PrimaryButton onClick={onApproved}>الموافقة على 15 دينار إضافية</PrimaryButton>
        <PrimaryButton variant="ghost" onClick={onBack}>رفض</PrimaryButton>
      </div>
    </div>
  );
}

function Completed({ onRate }: { onRate: () => void }) {
  return (
    <div className="h-full bg-white flex flex-col items-center justify-center px-8 text-center">
      <div className="w-32 h-32 rounded-full flex items-center justify-center" style={{ background: "#DCFCE7" }}>
        <CheckCircle2 size={72} color="#15803D" strokeWidth={2.5} />
      </div>
      <h1 className="mt-6" style={{ fontWeight: 700, fontSize: 24 }}>اكتملت الخدمة ✅</h1>
      <p style={{ color: "#475569", fontSize: 14 }} className="mt-2">شكراً لاستخدامك Fixly. ضمان 30 يوم مفعّل.</p>
      <Card className="mt-6 p-4 w-full text-start">
        <InlineRow label="رقم الحجز" value={<span style={{ fontFamily: "Inter" }}>#FX-20603</span>} />
        <InlineRow label="الفني" value="خالد المومني" />
        <InlineRow strong label="المبلغ المدفوع" value="50 دينار" />
      </Card>
      <div className="absolute bottom-8 inset-x-5">
        <PrimaryButton onClick={onRate}>قيّم تجربتك</PrimaryButton>
      </div>
    </div>
  );
}

function RateTechnician({ onSubmit }: { onSubmit: () => void }) {
  const [rating, setRating] = useState(5);
  return (
    <div className="h-full bg-white relative">
      <TopBar title="قيّم الخدمة" />
      <div className="px-5 mt-3 text-center">
        <Avatar name="خالد المومني" size={72} verified />
        <h2 className="mt-3" style={{ fontWeight: 700, fontSize: 18 }}>كيف كانت تجربتك مع خالد؟</h2>

        <div className="mt-5 flex justify-center gap-2">
          {[1,2,3,4,5].map(n => (
            <button key={n} onClick={() => setRating(n)} className="transition active:scale-90">
              <Star size={42} fill={n <= rating ? "#F5A623" : "transparent"} color={n <= rating ? "#F5A623" : "#CBD5E1"} strokeWidth={2} />
            </button>
          ))}
        </div>
        <div className="mt-2" style={{ color: "#F5A623", fontWeight: 700 }}>{["", "سيء", "مقبول", "جيد", "ممتاز", "رائع جداً!"][rating]}</div>

        <textarea placeholder="اكتب تعليقاً (اختياري)" className="w-full mt-5 rounded-xl border border-slate-200 px-4 py-3 outline-none resize-none text-start" rows={3} style={{ fontSize: 14 }} />

        <div className="mt-3 flex items-center gap-2">
          <button onClick={soon} className="flex-1 h-12 rounded-xl border border-dashed border-slate-300 flex items-center justify-center gap-2" style={{ color: "#1366D6", fontWeight: 600, fontSize: 13 }}>
            <Camera size={16} /> إضافة صور قبل/بعد
          </button>
        </div>
      </div>
      <FullCTA onClick={onSubmit}>إرسال التقييم</FullCTA>
    </div>
  );
}

/* ---------- Bookings ---------- */

function Bookings({ onOpen }: { onOpen: () => void }) {
  const [tab, setTab] = useState<"active" | "past">("active");
  const active = [{ id: "FX-20603", svc: SERVICES[0], status: "technician_arriving" as const, when: "اليوم · 3:30 م", price: 50 }];
  const past = [
    { id: "FX-20480", svc: SERVICES[1], status: "completed" as const, when: "05/06/2026", price: 40 },
    { id: "FX-20210", svc: SERVICES[2], status: "completed" as const, when: "28/05/2026", price: 30 },
    { id: "FX-19980", svc: SERVICES[4], status: "cancelled" as const, when: "20/05/2026", price: 35 },
  ];
  const list = tab === "active" ? active : past;
  return (
    <div className="h-full overflow-y-auto pb-20">
      <div className="bg-white px-5 pt-3 pb-1">
        <h1 style={{ fontWeight: 700, fontSize: 24 }}>حجوزاتي</h1>
        <div className="mt-4 flex gap-2 p-1 rounded-xl" style={{ background: "#F1F5F9" }}>
          {[["active","نشطة"],["past","سابقة"]].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k as any)} className="flex-1 h-9 rounded-lg transition" style={{ background: tab === k ? "#FFF" : "transparent", fontWeight: 600, fontSize: 13, color: tab === k ? "#1366D6" : "#475569", boxShadow: tab === k ? "0 1px 3px rgba(0,0,0,0.06)" : "none" }}>{label}</button>
          ))}
        </div>
      </div>

      <div className="px-5 mt-4 space-y-3">
        {list.length === 0 && (
          <div className="text-center py-16">
            <div className="text-6xl mb-3">📋</div>
            <p style={{ color: "#475569", fontSize: 14 }}>لا توجد حجوزات بعد</p>
            <p style={{ color: "#94A3B8", fontSize: 12 }} className="mt-1">اطلب أول خدمة الآن</p>
          </div>
        )}
        {list.map(b => (
          <button key={b.id} onClick={onOpen} className="w-full text-start">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <ServiceIcon id={b.svc.id} size={22} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{b.svc.ar}</span>
                  </div>
                  <div style={{ color: "#94A3B8", fontSize: 11 }} className="mt-0.5"><span style={{ fontFamily: "Inter" }}>#{b.id}</span> · {b.when}</div>
                </div>
                <PriceBadge amount={b.price} />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <StatusBadge status={b.status} />
                <span style={{ color: "#1366D6", fontWeight: 600, fontSize: 12 }}>عرض التفاصيل ›</span>
              </div>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

function BookingDetail({ onBack }: { onBack: () => void }) {
  return (
    <div className="h-full bg-white">
      <TopBar title="إيصال الخدمة" onBack={onBack} />
      <div className="px-5 mt-3 overflow-y-auto pb-8" style={{ height: "calc(100% - 56px)" }}>
        <Card className="p-5 text-center">
          <CheckCircle2 size={48} color="#1FAA59" className="mx-auto" />
          <div style={{ fontWeight: 700, fontSize: 18 }} className="mt-2">مكتملة</div>
          <div style={{ color: "#475569", fontSize: 12 }}><span style={{ fontFamily: "Inter" }}>#FX-20480</span> · 05/06/2026</div>
        </Card>

        <Card className="mt-4 p-4">
          <div className="flex items-center gap-3">
            <ServiceIcon id="plumb" size={22} />
            <div className="flex-1">
              <div style={{ fontWeight: 700, fontSize: 15 }}>سباكة</div>
              <div style={{ color: "#475569", fontSize: 12 }}>إصلاح تسريب الحوض</div>
            </div>
          </div>
        </Card>

        <Card className="mt-3 p-4">
          <div className="flex items-center gap-3">
            <Avatar name="عمر الشريف" verified />
            <div className="flex-1">
              <div style={{ fontWeight: 700, fontSize: 14 }}>عمر الشريف</div>
              <Stars rating={4.7} size={12} />
            </div>
          </div>
        </Card>

        <Card className="mt-3 p-4 space-y-2">
          <InlineRow label="سعر الخدمة" value="40 دينار" />
          <InlineRow label="عمل إضافي" value="0 دينار" />
          <InlineRow label="الخصم" value="−0 دينار" />
          <div className="h-px bg-slate-100" />
          <InlineRow strong label="المدفوع" value="40 دينار" />
          <div style={{ color: "#475569", fontSize: 12 }}>Apple Pay · ضمان فعّال حتى 05/07/2026</div>
        </Card>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <PrimaryButton variant="outline" onClick={() => notify("جارٍ تحميل الإيصال…", "success")}><Download size={16} /> تحميل</PrimaryButton>
          <PrimaryButton variant="outline" onClick={() => notify("تم نسخ رابط الإيصال", "success")}><Share2 size={16} /> مشاركة</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/* ---------- Guarantee ---------- */

function GuaranteeHome({ member, onNew, onTicket }: { member: boolean; onNew: () => void; onTicket: () => void }) {
  return (
    <div className="h-full overflow-y-auto pb-20">
      <div className="bg-white px-5 pt-3 pb-5">
        <h1 style={{ fontWeight: 700, fontSize: 24 }}>الضمان</h1>
        <Card className="mt-4 p-4 flex items-start gap-3" style={{ background: "linear-gradient(95deg,#1FAA59 0%,#15803D 100%)" }}>
          <ShieldCheck size={28} color="#FFF" />
          <div>
            <div style={{ color: "#FFF", fontWeight: 700, fontSize: 16 }}>ضمان {member ? "90 يوماً" : "30 يوماً"}</div>
            <div style={{ color: "#DCFCE7", fontSize: 12 }} className="mt-1">إذا تكررت المشكلة خلال المدة، نعيد الإصلاح مجاناً أو نسترد المبلغ.{member ? "" : " (90 يوماً لأعضاء الحماية)"}</div>
          </div>
        </Card>
      </div>

      <Section title="تذاكر مفتوحة">
        <button onClick={onTicket} className="w-full text-start">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <span style={{ fontWeight: 700, fontSize: 14 }}>تذكرة #GR-104</span>
              <span className="px-2 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#B45309", fontSize: 11, fontWeight: 600 }}>قيد المراجعة</span>
            </div>
            <div style={{ color: "#475569", fontSize: 12 }} className="mt-1">سباكة — عاد التسريب · 06/06/2026</div>
          </Card>
        </button>
      </Section>

      <Section title="حجوزات مشمولة بالضمان">
        <Card className="p-4">
          {[
            { svc: SERVICES[1], date: "05/06/2026", until: "05/07/2026" },
            { svc: SERVICES[0], date: "28/05/2026", until: "27/06/2026" },
          ].map((it, i) => (
            <button key={i} onClick={onNew} className="w-full text-start flex items-center gap-3 py-2.5 border-b last:border-0 border-slate-100">
              <ServiceIcon id={it.svc.id} size={20} />
              <div className="flex-1">
                <div style={{ fontWeight: 600, fontSize: 14 }}>{it.svc.ar}</div>
                <div style={{ color: "#94A3B8", fontSize: 11 }}>الضمان حتى <span style={{ fontFamily: "Inter" }}>{it.until}</span></div>
              </div>
              <ChevronLeft size={18} color="#94A3B8" />
            </button>
          ))}
        </Card>
        <button onClick={onNew} className="w-full mt-3 p-4 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center gap-2" style={{ color: "#1366D6", fontWeight: 600, fontSize: 14 }}>
          <Plus size={18} /> فتح تذكرة ضمان جديدة
        </button>
      </Section>
    </div>
  );
}

function GuaranteeNew({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  return (
    <div className="h-full bg-white relative">
      <TopBar title="تذكرة ضمان جديدة" onBack={onBack} />
      <div className="px-5 mt-3 space-y-3 overflow-y-auto pb-32" style={{ height: "calc(100% - 56px)" }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>الحجز</label>
          <Card className="mt-2 p-3 flex items-center gap-3">
            <ServiceIcon id="plumb" size={20} />
            <div className="flex-1">
              <div style={{ fontWeight: 600, fontSize: 14 }}>سباكة · #FX-20480</div>
              <div style={{ color: "#94A3B8", fontSize: 11 }}>05/06/2026</div>
            </div>
            <ChevronLeft size={16} color="#94A3B8" />
          </Card>
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>وصف المشكلة</label>
          <textarea className="w-full mt-2 rounded-xl border border-slate-200 px-4 py-3 outline-none resize-none" rows={4} style={{ fontSize: 14 }} defaultValue="عاد التسريب من حوض المطبخ بعد يومين من الإصلاح." />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>صور / فيديو (اختياري)</label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="aspect-square rounded-xl bg-slate-100 flex items-center justify-center" style={{ fontSize: 24 }}>🖼️</div>
            <div className="aspect-square rounded-xl bg-slate-100 flex items-center justify-center" style={{ fontSize: 24 }}>🎥</div>
            <button onClick={soon} className="aspect-square rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center" style={{ color: "#1366D6" }}>
              <Plus size={20} />
              <span style={{ fontSize: 11, fontWeight: 600 }}>إضافة</span>
            </button>
          </div>
        </div>

        <Card className="p-3 flex items-start gap-2" style={{ background: "#E8F1FE" }}>
          <ShieldCheck size={16} color="#1366D6" />
          <p style={{ color: "#0E4FA8", fontSize: 12 }}>سيتم الرد خلال ساعتين من فريقنا.</p>
        </Card>
      </div>
      <FullCTA onClick={onDone}>إرسال التذكرة</FullCTA>
    </div>
  );
}

function GuaranteeTicket({ onBack }: { onBack: () => void }) {
  return (
    <div className="h-full bg-white">
      <TopBar title="تذكرة #GR-104" onBack={onBack} />
      <div className="px-5 mt-3 overflow-y-auto pb-8" style={{ height: "calc(100% - 56px)" }}>
        <div className="space-y-4 mt-2">
          {[
            { label: "مفتوحة", time: "06/06 · 9:20 ص", state: "done" },
            { label: "قيد المراجعة", time: "06/06 · 10:05 ص", state: "active" },
            { label: "موافقة / رفض", time: "بانتظار", state: "wait" },
            { label: "الحل", time: "بانتظار", state: "wait" },
          ].map((s, i, arr) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: s.state === "wait" ? "#F1F5F9" : s.state === "active" ? "#FEF3C7" : "#DCFCE7", color: s.state === "wait" ? "#94A3B8" : s.state === "active" ? "#B45309" : "#15803D" }}>
                  {s.state === "done" ? "✓" : i + 1}
                </div>
                {i < arr.length - 1 && <div className="w-0.5 flex-1 my-1" style={{ background: "#E2E8F0" }} />}
              </div>
              <div className="pb-4">
                <div style={{ fontWeight: 700, fontSize: 14 }}>{s.label}</div>
                <div style={{ color: "#94A3B8", fontSize: 11, fontFamily: "Inter" }}>{s.time}</div>
              </div>
            </div>
          ))}
        </div>

        <Card className="p-4 mt-2" style={{ background: "#E8F1FE" }}>
          <div style={{ color: "#0E4FA8", fontWeight: 700, fontSize: 13 }}>رد الفريق</div>
          <p style={{ color: "#0E4FA8", fontSize: 13 }} className="mt-1">شكراً لتواصلك. سنرسل الفني عمر مرة أخرى دون أي رسوم. سيتم التواصل لتحديد الموعد.</p>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Profile + edges ---------- */

function Profile({ member, onAddresses, onPayments, onNotifs, onSupport, onSettings, onEditProfile, onProtection, onWallet, onVideo, onReferral }: any) {
  const quick = [
    { icon: Star, label: "خطة الحماية", action: onProtection, tint: "#EDE9FE", color: "#7C3AED" },
    { icon: Wallet, label: "المحفظة", action: onWallet, tint: "#DCFCE7", color: "#15803D" },
    { icon: Video, label: "الفحص المرئي", action: onVideo, tint: "#E8F1FE", color: "#1366D6" },
    { icon: Gift, label: "ادعُ صديقاً", action: onReferral, tint: "#FEF3C7", color: "#B45309" },
  ];
  const rows = [
    { icon: MapPin, label: "العناوين المحفوظة", action: onAddresses },
    { icon: CreditCard, label: "وسائل الدفع", action: onPayments },
    { icon: Bell, label: "الإشعارات", action: onNotifs },
    { icon: Headphones, label: "الدعم والمساعدة", action: onSupport },
    { icon: SettingsIcon, label: "الإعدادات", action: onSettings },
  ];
  return (
    <div className="h-full overflow-y-auto pb-20">
      <div className="bg-white px-5 pt-3 pb-5">
        <h1 style={{ fontWeight: 700, fontSize: 24 }}>حسابي</h1>
        <Card className="mt-4 p-4 flex items-center gap-4">
          <Avatar name="أحمد العلي" size={56} verified />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ fontWeight: 700, fontSize: 17 }}>أحمد العلي</span>
              {member && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "#E8F1FE", color: "#1366D6", fontSize: 11, fontWeight: 700 }}>
                  <Star size={12} fill="#1366D6" /> عضو الحماية
                </span>
              )}
            </div>
            <div style={{ color: "#475569", fontSize: 13, fontFamily: "Inter" }}>+962 79 0••• ••00</div>
          </div>
          <button onClick={onEditProfile} style={{ color: "#1366D6", fontWeight: 600, fontSize: 13 }}>تعديل</button>
        </Card>
        <button onClick={onWallet} className="mt-3 w-full flex items-center justify-between rounded-xl px-4 py-3" style={{ background: "#DCFCE7" }}>
          <span className="flex items-center gap-2" style={{ color: "#15803D", fontWeight: 700, fontSize: 13 }}><Wallet size={16} /> رصيدك</span>
          <span style={{ color: "#15803D", fontWeight: 700, fontSize: 15 }}><span style={{ fontFamily: "Inter" }}>{CREDIT_BALANCE}</span> دينار ›</span>
        </button>
      </div>

      <Section>
        <div className="grid grid-cols-4 gap-2">
          {quick.map(q => (
            <button key={q.label} onClick={q.action} className="flex flex-col items-center gap-1.5">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: q.tint, color: q.color }}>
                <q.icon size={22} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#475569", textAlign: "center" }}>{q.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section>
        <Card className="overflow-hidden">
          {rows.map((r, i) => (
            <button key={i} onClick={r.action} className="w-full px-4 py-3.5 flex items-center gap-3 border-b last:border-0 border-slate-100">
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#E8F1FE", color: "#1366D6" }}>
                <r.icon size={18} />
              </div>
              <span className="flex-1 text-start" style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</span>
              <ChevronLeft size={18} color="#94A3B8" />
            </button>
          ))}
        </Card>
      </Section>
    </div>
  );
}

const INITIAL_ADDRESSES = [
  { id: 1, label: "المنزل", addr: "خلدا، شارع وصفي التل، عمارة 12، ط2", def: true },
  { id: 2, label: "العمل", addr: "الصويفية، دوار باريس، عمارة 5، ط4", def: false },
  { id: 3, label: "بيت الوالد", addr: "تلاع العلي، شارع زهران، فيلا 8", def: false },
];

function Addresses({ onBack }: { onBack: () => void }) {
  const [addrs, setAddrs] = useState(INITIAL_ADDRESSES);
  const [editing, setEditing] = useState<typeof INITIAL_ADDRESSES[number] | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAddr, setNewAddr] = useState("");

  return (
    <div className="h-full bg-white relative">
      <TopBar title="العناوين المحفوظة" onBack={onBack} />
      <div className="px-5 mt-3 space-y-3 overflow-y-auto pb-6" style={{ height: "calc(100% - 56px)" }}>
        {addrs.map((a) => (
          <Card key={a.id} className="p-4 flex items-start gap-3">
            <MapPin size={20} color="#1366D6" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span style={{ fontWeight: 700, fontSize: 14 }}>{a.label}</span>
                {a.def && <span className="px-1.5 py-0.5 rounded" style={{ background: "#DCFCE7", color: "#15803D", fontSize: 10, fontWeight: 700 }}>افتراضي</span>}
              </div>
              <p style={{ color: "#475569", fontSize: 13 }} className="mt-1">{a.addr}</p>
            </div>
            <button onClick={() => setEditing({ ...a })} style={{ color: "#1366D6", fontSize: 12, fontWeight: 600 }}>تعديل</button>
          </Card>
        ))}
        <button onClick={() => { setNewLabel(""); setNewAddr(""); setAdding(true); }} className="w-full p-4 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center gap-2" style={{ color: "#1366D6", fontWeight: 600, fontSize: 14 }}>
          <Plus size={18} /> إضافة عنوان جديد
        </button>
      </div>

      {/* Edit address modal */}
      {editing && (
        <div className="absolute inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="w-full bg-white rounded-t-3xl p-5 space-y-3">
            <h3 style={{ fontWeight: 700, fontSize: 18 }}>تعديل العنوان</h3>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>الاسم</label>
              <input value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 outline-none" style={{ fontSize: 14 }} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>العنوان</label>
              <input value={editing.addr} onChange={e => setEditing({ ...editing, addr: e.target.value })} className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 outline-none" style={{ fontSize: 14 }} />
            </div>
            <div className="flex gap-2 pt-2">
              <PrimaryButton variant="outline" onClick={() => setEditing(null)}>إلغاء</PrimaryButton>
              <PrimaryButton onClick={() => { setAddrs(addrs.map(a => a.id === editing!.id ? editing! : a)); setEditing(null); }}>حفظ</PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {/* Add address modal */}
      {adding && (
        <div className="absolute inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="w-full bg-white rounded-t-3xl p-5 space-y-3">
            <h3 style={{ fontWeight: 700, fontSize: 18 }}>إضافة عنوان جديد</h3>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>الاسم</label>
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="مثال: المنزل" className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 outline-none" style={{ fontSize: 14 }} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>العنوان</label>
              <input value={newAddr} onChange={e => setNewAddr(e.target.value)} placeholder="الحي، الشارع، رقم العمارة" className="mt-1 w-full h-11 rounded-xl border border-slate-200 px-3 outline-none" style={{ fontSize: 14 }} />
            </div>
            <div className="flex gap-2 pt-2">
              <PrimaryButton variant="outline" onClick={() => setAdding(false)}>إلغاء</PrimaryButton>
              <PrimaryButton onClick={() => { if (newLabel && newAddr) { setAddrs([...addrs, { id: Date.now(), label: newLabel, addr: newAddr, def: false }]); setAdding(false); } }}>إضافة</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentMethods({ onBack }: { onBack: () => void }) {
  const [cards, setCards] = useState([
    { id: 1, brand: "Visa", num: "•••• 4242", def: true },
    { id: 2, brand: "Mastercard", num: "•••• 5588", def: false },
  ]);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  return (
    <div className="h-full bg-white relative">
      <TopBar title="وسائل الدفع" onBack={onBack} />
      <div className="px-5 mt-3 space-y-3">
        {cards.map((c) => (
          <Card key={c.id} className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "#F1F5F9" }}>
              <CreditCard size={20} color="#1366D6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span style={{ fontWeight: 700, fontSize: 14 }}>{c.brand}</span>
                <span style={{ fontFamily: "Inter", fontWeight: 600, color: "#475569" }}>{c.num}</span>
                {c.def && <span className="px-1.5 py-0.5 rounded" style={{ background: "#DCFCE7", color: "#15803D", fontSize: 10, fontWeight: 700 }}>افتراضي</span>}
              </div>
            </div>
            {!c.def && (
              <button onClick={() => setDeletingId(c.id)} style={{ color: "#E5484D", fontSize: 12, fontWeight: 600 }}>حذف</button>
            )}
          </Card>
        ))}
        <button onClick={soon} className="w-full p-4 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center gap-2" style={{ color: "#1366D6", fontWeight: 600, fontSize: 14 }}>
          <Plus size={18} /> إضافة بطاقة جديدة
        </button>
      </div>

      {deletingId !== null && (
        <ConfirmDialog
          title="حذف البطاقة"
          body="هل تريد حذف هذه البطاقة؟"
          confirmLabel="حذف"
          variant="destructive"
          onConfirm={() => { setCards(cards.filter(c => c.id !== deletingId)); setDeletingId(null); }}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}

function Notifications({ onBack }: { onBack: () => void }) {
  const items = [
    { icon: "✅", title: "تم قبول حجزك", body: "الفني خالد في الطريق", time: "الآن", unread: true },
    { icon: "🚗", title: "الفني على بُعد 5 دقائق", body: "تتبع الفني الآن", time: "قبل 5 د", unread: true },
    { icon: "⭐", title: "تم إكمال الخدمة", body: "قيّم تجربتك مع عمر", time: "أمس", unread: false },
    { icon: "🛡️", title: "تحديث على طلب الضمان", body: "ردّ فريقنا على تذكرتك", time: "06/06", unread: false },
  ];
  return (
    <div className="h-full bg-white">
      <TopBar title="الإشعارات" onBack={onBack} />
      <div className="overflow-y-auto">
        {items.map((n, i) => (
          <div key={i} className="px-5 py-3.5 flex items-center gap-3 border-b border-slate-100" style={{ background: n.unread ? "#E8F1FE" : "#FFF" }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#FFF", fontSize: 20 }}>{n.icon}</div>
            <div className="flex-1">
              <div style={{ fontWeight: 700, fontSize: 14 }}>{n.title}</div>
              <div style={{ color: "#475569", fontSize: 12 }} className="mt-0.5">{n.body}</div>
            </div>
            <span style={{ color: "#94A3B8", fontSize: 11 }}>{n.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const FAQ_ITEMS = [
  { q: "كيف يتم الدفع؟", a: "يتم الدفع إلكترونياً عبر Apple Pay أو Google Pay أو بطاقة الائتمان. لا يتم الخصم إلا بعد إتمام الخدمة." },
  { q: "ما مدة الضمان؟", a: "كل خدمة تشمل ضمان 30 يوماً. إذا تكررت المشكلة، نعيد الإصلاح مجاناً أو نسترد المبلغ." },
  { q: "هل يمكنني الإلغاء؟", a: "نعم، يمكنك الإلغاء مجاناً قبل توجّه الفني. بعد انطلاقه قد تُطبَّق رسوم رمزية." },
  { q: "هل الأسعار ثابتة؟", a: "نعم، السعر المعروض هو السعر النهائي. لا مفاجآت. قد يُضاف عمل إضافي فقط بموافقتك المسبقة." },
];

function Support({ member, onBack }: { member: boolean; onBack: () => void }) {
  return (
    <div className="h-full bg-white">
      <TopBar title="الدعم والمساعدة" onBack={onBack} />
      <div className="px-5 mt-3 space-y-3">
        <Card className="p-4 flex items-center gap-3" style={{ background: "linear-gradient(95deg,#1366D6 0%,#0E4FA8 100%)" }}>
          <Headphones size={28} color="#FFF" />
          <div className="flex-1">
            <div style={{ color: "#FFF", fontWeight: 700, fontSize: 15 }}>نحن هنا لمساعدتك 24/7</div>
            <div style={{ color: "#CFE0FB", fontSize: 12 }}>الرد خلال 5 دقائق</div>
          </div>
        </Card>
        {member && (
          <button onClick={() => notify("دعم VIP — أولوية في الرد")} className="w-full text-start">
            <Card className="p-3 flex items-center gap-2" style={{ background: "#EDE9FE" }}>
              <Star size={18} color="#7C3AED" fill="#7C3AED" />
              <span style={{ color: "#6D28D9", fontWeight: 700, fontSize: 13 }}>دعم VIP — أولوية في الرد لأعضاء الحماية</span>
            </Card>
          </button>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => notify("جارٍ الاتصال بـ +962 6 555 0000…")} className="text-start">
            <Card className="p-4 text-center">
              <Phone size={24} color="#1366D6" className="mx-auto mb-2" />
              <div style={{ fontWeight: 700, fontSize: 14 }}>اتصل بنا</div>
              <div style={{ color: "#475569", fontSize: 11, fontFamily: "Inter" }} className="mt-0.5">+962 6 555 0000</div>
            </Card>
          </button>
          <button onClick={() => notify("فتح المحادثة الفورية…")} className="text-start">
            <Card className="p-4 text-center">
              <MessageCircle size={24} color="#0FB5A6" className="mx-auto mb-2" />
              <div style={{ fontWeight: 700, fontSize: 14 }}>محادثة فورية</div>
              <div style={{ color: "#475569", fontSize: 11 }} className="mt-0.5">عربي · 5 د</div>
            </Card>
          </button>
        </div>
        <Section title="الأسئلة الشائعة">
          <FaqAccordion items={FAQ_ITEMS} />
        </Section>
      </div>
    </div>
  );
}

function Settings({ onBack, onLanguage, onNotifPref, onAppearance, onLogout }: { onBack: () => void; onLanguage: () => void; onNotifPref: () => void; onAppearance: () => void; onLogout: () => void }) {
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const prefRows = [
    { label: "اللغة", value: "العربية", action: onLanguage },
    { label: "الإشعارات", value: "مفعّلة", action: onNotifPref },
    { label: "المظهر", value: "فاتح", action: onAppearance },
  ];

  return (
    <div className="h-full bg-white relative">
      <TopBar title="الإعدادات" onBack={onBack} />
      <div className="px-5 mt-3 space-y-3">
        <Card>
          {prefRows.map(({ label, value, action }) => (
            <button key={label} onClick={action} className="w-full px-4 py-3.5 flex items-center justify-between border-b last:border-0 border-slate-100">
              <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
              <span style={{ color: "#475569", fontSize: 13 }}>{value} ›</span>
            </button>
          ))}
        </Card>
        <Card>
          {["الشروط والأحكام", "سياسة الخصوصية", "عن التطبيق · الإصدار 1.0.0"].map((t, i) => (
            <button key={i} onClick={() => notify(t)} className="w-full px-4 py-3.5 flex items-center text-start border-b last:border-0 border-slate-100">
              <span className="flex-1" style={{ fontSize: 14 }}>{t}</span>
              <ChevronLeft size={16} color="#94A3B8" />
            </button>
          ))}
        </Card>
        <button onClick={() => setConfirmLogout(true)} className="w-full p-4 rounded-xl bg-white border border-red-200" style={{ color: "#E5484D", fontWeight: 700, fontSize: 14 }}>تسجيل الخروج</button>
        <button onClick={() => setConfirmDelete(true)} className="w-full p-4 text-center" style={{ color: "#94A3B8", fontSize: 13 }}>حذف الحساب نهائياً</button>
      </div>

      {confirmLogout && (
        <ConfirmDialog
          title="تسجيل الخروج"
          body="هل أنت متأكد من تسجيل الخروج من حسابك؟"
          confirmLabel="تسجيل الخروج"
          variant="destructive"
          onConfirm={onLogout}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="حذف الحساب نهائياً"
          body="سيتم حذف جميع بياناتك بشكل دائم. هذا الإجراء لا يمكن التراجع عنه."
          confirmLabel="حذف الحساب"
          variant="destructive"
          onConfirm={() => { setConfirmDelete(false); notify("تم حذف الحساب", "success"); onLogout(); }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

/* ---------- Edit Profile ---------- */

function EditProfile({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("أحمد العلي");
  const [email, setEmail] = useState("ahmed@example.com");
  const [saved, setSaved] = useState(false);

  return (
    <div className="h-full bg-white relative">
      <TopBar title="تعديل الملف الشخصي" onBack={onBack} />
      <div className="px-5 mt-5 space-y-4">
        <div className="flex flex-col items-center mb-2">
          <div className="relative">
            <Avatar name={name} size={80} verified />
            <button onClick={soon} aria-label="تغيير الصورة" className="absolute bottom-0 end-0 w-8 h-8 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center">
              <Camera size={14} color="#1366D6" />
            </button>
          </div>
          <button onClick={soon} style={{ color: "#1366D6", fontSize: 13, fontWeight: 600 }} className="mt-2">تغيير الصورة</button>
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>الاسم الكامل</label>
          <input value={name} onChange={e => setName(e.target.value)} className="mt-2 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14 }} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>رقم الهاتف</label>
          <div className="mt-2 h-12 rounded-xl border border-slate-200 bg-slate-50 flex items-center px-4 gap-2">
            <span style={{ fontFamily: "Inter", color: "#94A3B8" }}>+962 79 0••• ••00</span>
            <span className="px-1.5 py-0.5 rounded" style={{ background: "#E2E8F0", color: "#64748B", fontSize: 10, fontWeight: 700 }}>لا يمكن تغييره</span>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>البريد الإلكتروني (اختياري)</label>
          <input value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none" style={{ fontSize: 14, fontFamily: "Inter" }} />
        </div>
      </div>
      <FullCTA onClick={() => { setSaved(true); setTimeout(onBack, 600); }}>
        {saved ? "تم الحفظ ✓" : "حفظ التغييرات"}
      </FullCTA>
    </div>
  );
}

/* ---------- Settings sub-screens ---------- */

function SettingsLanguage({ onBack }: { onBack: () => void }) {
  const [sel, setSel] = useState("ar");
  const langs = [{ id: "ar", label: "العربية", sub: "Arabic" }, { id: "en", label: "English", sub: "الإنجليزية" }];
  return (
    <div className="h-full bg-white">
      <TopBar title="اللغة" onBack={onBack} />
      <div className="px-5 mt-3 space-y-2">
        {langs.map(l => (
          <button key={l.id} onClick={() => setSel(l.id)} className="w-full text-start">
            <Card className="p-4 flex items-center gap-3" style={{ borderColor: sel === l.id ? "#1366D6" : "transparent", borderWidth: 2 }}>
              <div className="flex-1">
                <div style={{ fontWeight: 700, fontSize: 15 }}>{l.label}</div>
                <div style={{ color: "#475569", fontSize: 12 }}>{l.sub}</div>
              </div>
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: sel === l.id ? "#1366D6" : "#CBD5E1" }}>
                {sel === l.id && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#1366D6" }} />}
              </div>
            </Card>
          </button>
        ))}
        <p style={{ color: "#94A3B8", fontSize: 12, textAlign: "center" }} className="mt-4">سيتم تطبيق اللغة فور الاختيار</p>
      </div>
    </div>
  );
}

function SettingsNotificationsPref({ onBack }: { onBack: () => void }) {
  const [prefs, setPrefs] = useState({
    bookings: true, arriving: true, completed: true, promotions: false, guarantee: true,
  });
  const rows: { key: keyof typeof prefs; label: string; sub: string }[] = [
    { key: "bookings", label: "تحديثات الحجوزات", sub: "تأكيد، قبول، إلغاء" },
    { key: "arriving", label: "الفني في الطريق", sub: "إشعار عند اقتراب الفني" },
    { key: "completed", label: "اكتمال الخدمة", sub: "إيصال بعد الإنجاز" },
    { key: "guarantee", label: "تحديثات الضمان", sub: "ردود على تذاكر الضمان" },
    { key: "promotions", label: "العروض والتخفيضات", sub: "رموز الخصم والعروض الخاصة" },
  ];
  return (
    <div className="h-full bg-white">
      <TopBar title="إعدادات الإشعارات" onBack={onBack} />
      <div className="px-5 mt-3">
        <Card>
          {rows.map((r, i) => (
            <div key={r.key} className="px-4 py-3.5 flex items-center gap-3 border-b last:border-0 border-slate-100">
              <div className="flex-1">
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.label}</div>
                <div style={{ color: "#94A3B8", fontSize: 12 }}>{r.sub}</div>
              </div>
              <button
                onClick={() => setPrefs({ ...prefs, [r.key]: !prefs[r.key] })}
                className="w-12 h-7 rounded-full relative transition-colors"
                style={{ background: prefs[r.key] ? "#1366D6" : "#CBD5E1" }}
              >
                <div className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all" style={{ [prefs[r.key] ? "right" : "left"]: 2 }} />
              </button>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function SettingsAppearance({ onBack }: { onBack: () => void }) {
  const [theme, setTheme] = useState("light");
  const themes = [
    { id: "light", label: "فاتح", icon: <Sun size={22} color="#F5A623" /> },
    { id: "dark", label: "داكن", icon: <Moon size={22} color="#6366F1" /> },
    { id: "system", label: "تلقائي (النظام)", icon: <SettingsIcon size={22} color="#64748B" /> },
  ];
  return (
    <div className="h-full bg-white">
      <TopBar title="المظهر" onBack={onBack} />
      <div className="px-5 mt-3 space-y-2">
        {themes.map(t => (
          <button key={t.id} onClick={() => setTheme(t.id)} className="w-full text-start">
            <Card className="p-4 flex items-center gap-3" style={{ borderColor: theme === t.id ? "#1366D6" : "transparent", borderWidth: 2 }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: "#F1F5F9" }}>{t.icon}</div>
              <span className="flex-1" style={{ fontWeight: 700, fontSize: 15 }}>{t.label}</span>
              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: theme === t.id ? "#1366D6" : "#CBD5E1" }}>
                {theme === t.id && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#1366D6" }} />}
              </div>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Edge cases ---------- */

function NoTechs({ onRetry, onLater }: { onRetry: () => void; onLater: () => void }) {
  return (
    <div className="h-full bg-white flex flex-col items-center justify-center px-8 text-center">
      <div className="text-7xl mb-5">🛠️</div>
      <h1 style={{ fontWeight: 700, fontSize: 22 }}>لا يوجد فنيون متاحون الآن</h1>
      <p style={{ color: "#475569", fontSize: 14 }} className="mt-2">حاول بعد قليل، أو اختر موعداً لاحقاً.</p>
      <div className="absolute bottom-8 inset-x-5 space-y-2">
        <PrimaryButton onClick={onRetry}>إعادة المحاولة</PrimaryButton>
        <PrimaryButton variant="outline" onClick={onLater}>حجز لاحقاً</PrimaryButton>
      </div>
    </div>
  );
}

function PaymentFailed({ onRetry, onChange }: { onRetry: () => void; onChange: () => void }) {
  return (
    <div className="h-full bg-white flex flex-col items-center justify-center px-8 text-center">
      <div className="w-28 h-28 rounded-full flex items-center justify-center" style={{ background: "#FEE2E2" }}>
        <X size={56} color="#E5484D" strokeWidth={2.5} />
      </div>
      <h1 className="mt-6" style={{ fontWeight: 700, fontSize: 22 }}>فشلت عملية الدفع</h1>
      <p style={{ color: "#475569", fontSize: 14 }} className="mt-2">فشلت عملية الدفع. جرّب وسيلة دفع أخرى.</p>
      <div className="absolute bottom-8 inset-x-5 space-y-2">
        <PrimaryButton onClick={onRetry}>إعادة المحاولة</PrimaryButton>
        <PrimaryButton variant="outline" onClick={onChange}>تغيير وسيلة الدفع</PrimaryButton>
      </div>
    </div>
  );
}

function Offline({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="h-full bg-white flex flex-col items-center justify-center px-8 text-center">
      <div className="w-28 h-28 rounded-full flex items-center justify-center" style={{ background: "#F1F5F9" }}>
        <WifiOff size={56} color="#94A3B8" />
      </div>
      <h1 className="mt-6" style={{ fontWeight: 700, fontSize: 22 }}>لا يوجد اتصال</h1>
      <p style={{ color: "#475569", fontSize: 14 }} className="mt-2">تعذّر الاتصال. تحقق من الإنترنت وحاول مجدداً.</p>
      <div className="absolute bottom-8 inset-x-5">
        <PrimaryButton onClick={onRetry}><span className="inline-flex items-center gap-2"><RefreshCw size={16} /> إعادة المحاولة</span></PrimaryButton>
      </div>
    </div>
  );
}

function LocationDenied({ onEnable, onBack }: { onEnable: () => void; onBack: () => void }) {
  return (
    <div className="h-full bg-white relative">
      <TopBar title="الموقع" onBack={onBack} />
      <div className="h-full flex flex-col items-center justify-center px-8 text-center">
        <div className="w-28 h-28 rounded-full flex items-center justify-center" style={{ background: "#FEF3C7" }}>
          <MapPin size={56} color="#B45309" />
        </div>
        <h1 className="mt-6" style={{ fontWeight: 700, fontSize: 22 }}>الموقع غير مفعّل</h1>
        <p style={{ color: "#475569", fontSize: 14 }} className="mt-2">فعّل الموقع لتحديد عنوانك وإرسال أقرب فني.</p>
      </div>
      <div className="absolute bottom-8 inset-x-5 space-y-2">
        <PrimaryButton onClick={onEnable}>تفعيل الموقع</PrimaryButton>
        <PrimaryButton variant="ghost" onClick={onBack}>إدخال العنوان يدوياً</PrimaryButton>
      </div>
    </div>
  );
}

/* ---------- Protection Plan ---------- */

function ProtectionPlan({ member, renewDate, onBack, onSubscribe, onCancel }: { member: boolean; renewDate: string; onBack: () => void; onSubscribe: () => void; onCancel: () => void }) {
  const [pastDue] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const benefits = [
    { Icon: Clock, t: "أولوية خلال 30 دقيقة" },
    { Icon: Tag, t: "خصم 15% على كل خدمة" },
    { Icon: ShieldCheck, t: "ضمان ممتد 90 يوم" },
    { Icon: BadgeCheck, t: "فحص مجاني كل 3 أشهر" },
    { Icon: Headphones, t: "دعم VIP — أولوية في الرد" },
  ];
  return (
    <div className="h-full bg-white relative">
      <TopBar title="خطة الحماية" onBack={onBack} />
      <div className="px-5 mt-3 overflow-y-auto pb-32" style={{ height: "calc(100% - 56px)" }}>
        <Card className="p-5" style={{ background: "linear-gradient(135deg,#1366D6 0%,#0E4FA8 100%)" }}>
          <div className="flex items-center gap-2">
            <Star size={24} color="#FFF" fill="#FFF" />
            <span style={{ color: "#FFF", fontWeight: 800, fontSize: 20 }}>خطة الحماية</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1" style={{ color: "#FFF" }}>
            <span style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 32 }}>5</span>
            <span style={{ fontSize: 14 }}>دنانير / شهر</span>
          </div>
          {member && (
            <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.25)", color: "#FFF", fontSize: 11, fontWeight: 700 }}>
              {pastDue ? "متأخر" : "فعّال"} · يتجدد في <span style={{ fontFamily: "Inter" }}>{renewDate}</span>
            </div>
          )}
        </Card>

        {member && pastDue && (
          <Card className="mt-3 p-3 flex items-start gap-2" style={{ background: "#FEF3C7" }}>
            <AlertCircle size={18} color="#B45309" />
            <p style={{ color: "#92400E", fontSize: 13 }}>تعذّر التجديد — حدّث بطاقتك للاستمرار في التمتع بالمزايا.</p>
          </Card>
        )}

        <Section title="المزايا">
          <Card className="p-4 space-y-3">
            {benefits.map(({ Icon, t }) => (
              <div key={t} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#E8F1FE", color: "#1366D6" }}><Icon size={18} /></div>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{t}</span>
              </div>
            ))}
          </Card>
        </Section>

        {member && (
          <Card className="mt-3 p-3" style={{ background: "#DCFCE7" }}>
            <p style={{ color: "#166534", fontSize: 12 }}>وفّرت <span style={{ fontFamily: "Inter", fontWeight: 700 }}>18</span> دينار هذا الشهر بفضل عضويتك.</p>
          </Card>
        )}
      </div>

      {member ? (
        <div className="absolute bottom-0 inset-x-0 px-5 pt-3 pb-6 bg-white border-t border-slate-100 space-y-2">
          {pastDue && <PrimaryButton onClick={() => notify("تم فتح تحديث البطاقة")}>تحديث البطاقة</PrimaryButton>}
          <PrimaryButton variant="ghost" onClick={() => setConfirmCancel(true)}>إلغاء الاشتراك</PrimaryButton>
        </div>
      ) : (
        <FullCTA onClick={onSubscribe}>اشترك الآن — <span style={{ fontFamily: "Inter" }}>5</span> دنانير/شهر</FullCTA>
      )}
      {confirmCancel && (
        <ConfirmDialog
          title="إلغاء خطة الحماية؟"
          body="ستبقى المزايا حتى نهاية الفترة."
          confirmLabel="تأكيد الإلغاء"
          variant="destructive"
          onConfirm={() => { setConfirmCancel(false); onCancel(); }}
          onCancel={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
}

/* ---------- Wallet / service credits ---------- */

function WalletScreen({ onBack }: { onBack: () => void }) {
  const history = [
    { reason: "تعويض تأخير", date: "06/06/2026", amount: 20 },
    { reason: "إحالة صديق", date: "01/06/2026", amount: 5 },
    { reason: "استخدام على حجز سباكة", date: "28/05/2026", amount: -5 },
  ];
  const empty = false;
  return (
    <div className="h-full bg-white">
      <TopBar title="رصيدي" onBack={onBack} />
      <div className="px-5 mt-3 overflow-y-auto pb-8" style={{ height: "calc(100% - 56px)" }}>
        <Card className="p-6 text-center" style={{ background: "linear-gradient(135deg,#0FB5A6 0%,#0D9488 100%)" }}>
          <div style={{ color: "#CCFBF1", fontSize: 13 }}>رصيدك الحالي</div>
          <div className="mt-1 flex items-baseline justify-center gap-1" style={{ color: "#FFF" }}>
            <span style={{ fontFamily: "Inter", fontWeight: 800, fontSize: 40 }}>{CREDIT_BALANCE}</span>
            <span style={{ fontSize: 16 }}>دينار</span>
          </div>
          <div style={{ color: "#CCFBF1", fontSize: 12 }} className="mt-2">يُخصم تلقائياً من فاتورتك القادمة</div>
        </Card>

        <Section title="السجل">
          {empty ? (
            <div className="text-center py-14">
              <Wallet size={48} color="#CBD5E1" className="mx-auto" />
              <p style={{ color: "#475569", fontSize: 14 }} className="mt-3">لا يوجد رصيد بعد</p>
            </div>
          ) : (
            <Card className="overflow-hidden">
              {history.map((h, i) => (
                <div key={i} className="px-4 py-3.5 flex items-center gap-3 border-b last:border-0 border-slate-100">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: h.amount > 0 ? "#DCFCE7" : "#F1F5F9", color: h.amount > 0 ? "#15803D" : "#475569" }}>
                    {h.amount > 0 ? <Gift size={16} /> : <CreditCard size={16} />}
                  </div>
                  <div className="flex-1">
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{h.reason}</div>
                    <div style={{ color: "#94A3B8", fontSize: 11, fontFamily: "Inter" }}>{h.date}</div>
                  </div>
                  <span style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 15, color: h.amount > 0 ? "#15803D" : "#E5484D" }}>{h.amount > 0 ? "+" : ""}{h.amount} دينار</span>
                </div>
              ))}
            </Card>
          )}
        </Section>
      </div>
    </div>
  );
}

/* ---------- Video pre-check quotes ---------- */

function VideoQuotes({ onBack, onNew, onAccept }: { onBack: () => void; onNew: () => void; onAccept: () => void }) {
  const quotes = [
    { id: "Q-31", svc: SERVICES[2], desc: "الوحدة لا تبرّد", status: "quoted" as const, price: 45 },
    { id: "Q-28", svc: SERVICES[0], desc: "قاطع الكهرباء يفصل", status: "pending" as const },
    { id: "Q-24", svc: SERVICES[1], desc: "تسريب من السخان", status: "accepted" as const, price: 40 },
  ];
  const label = { pending: ["بانتظار التسعير", "#FEF3C7", "#B45309"], quoted: ["مُسعّر", "#DCFCE7", "#15803D"], accepted: ["مقبول", "#DBEAFE", "#1366D6"] };
  const empty = false;
  return (
    <div className="h-full bg-white relative">
      <TopBar title="الفحص المرئي" onBack={onBack} />
      <div className="px-5 mt-3 overflow-y-auto pb-28" style={{ height: "calc(100% - 56px)" }}>
        {empty ? (
          <div className="text-center py-16">
            <Video size={48} color="#CBD5E1" className="mx-auto" />
            <p style={{ color: "#475569", fontSize: 14 }} className="mt-3">لا توجد طلبات تسعير بعد</p>
          </div>
        ) : (
          <div className="space-y-3">
            {quotes.map(q => {
              const [txt, bg, fg] = label[q.status];
              return (
                <Card key={q.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <ServiceIcon id={q.svc.id} size={20} />
                    <div className="flex-1">
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{q.svc.ar}</div>
                      <div style={{ color: "#475569", fontSize: 12 }}>«{q.desc}»</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full" style={{ background: bg, color: fg, fontSize: 11, fontWeight: 700 }}>{txt}</span>
                  </div>
                  {q.status === "quoted" && (
                    <div className="mt-3 p-3 rounded-xl flex items-center justify-between" style={{ background: "#E8F1FE" }}>
                      <div>
                        <div style={{ color: "#0E4FA8", fontSize: 12 }}>السعر الثابت</div>
                        <PriceBadge amount={q.price!} />
                      </div>
                      <button onClick={onAccept} className="px-4 h-10 rounded-xl" style={{ background: "#1366D6", color: "#FFF", fontWeight: 600, fontSize: 13 }}>اقبل واحجز</button>
                    </div>
                  )}
                  {q.status === "accepted" && (
                    <div className="mt-2" style={{ color: "#15803D", fontSize: 12, fontWeight: 600 }}>تم إنشاء الحجز بالسعر المتفق عليه · <span style={{ fontFamily: "Inter" }}>{q.price}</span> دينار</div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
      <FullCTA onClick={onNew} icon={<Plus size={18} />}>طلب تسعير جديد</FullCTA>
    </div>
  );
}

function VideoNewRequest({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [svc, setSvc] = useState(SERVICES[0].id);
  const launch = SERVICES.filter(s => isLaunch(s.id));
  return (
    <div className="h-full bg-white relative">
      <TopBar title="طلب تسعير جديد" onBack={onBack} />
      <div className="px-5 mt-3 space-y-4 overflow-y-auto pb-32" style={{ height: "calc(100% - 56px)" }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>الخدمة</label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {launch.map(s => (
              <button key={s.id} onClick={() => setSvc(s.id)} className="text-start">
                <Card className="p-3 flex flex-col items-center gap-1" style={{ borderColor: svc === s.id ? "#1366D6" : "transparent", borderWidth: 2 }}>
                  <ServiceIcon id={s.id} size={20} />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{s.ar}</span>
                </Card>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>فيديو المشكلة</label>
          <button onClick={soon} className="mt-2 w-full aspect-video rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-2" style={{ color: "#7C3AED" }}>
            <Video size={28} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>تسجيل / رفع فيديو</span>
          </button>
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>وصف المشكلة</label>
          <textarea placeholder="اشرح المشكلة باختصار" className="w-full mt-2 rounded-xl border border-slate-200 px-4 py-3 outline-none resize-none" rows={3} style={{ fontSize: 14 }} />
        </div>
        <div className="flex items-center gap-2 p-3 rounded-xl border border-slate-200">
          <MapPin size={18} color="#1366D6" />
          <span style={{ fontSize: 14 }}>خلدا، شارع وصفي التل، عمارة 12، ط2</span>
        </div>
      </div>
      <FullCTA onClick={() => { notify("تم إرسال طلب التسعير", "success"); onDone(); }}>طلب تسعير</FullCTA>
    </div>
  );
}

/* ---------- Referral ---------- */

function Referral({ onBack }: { onBack: () => void }) {
  return (
    <div className="h-full bg-white relative">
      <TopBar title="ادعُ صديقاً" onBack={onBack} />
      <div className="px-5 mt-3 text-center">
        <div className="w-32 h-32 mx-auto rounded-full flex items-center justify-center" style={{ background: "#FEF3C7" }}>
          <Gift size={64} color="#B45309" />
        </div>
        <h1 className="mt-5" style={{ fontWeight: 700, fontSize: 22 }}>ادعُ صديقاً</h1>
        <p style={{ color: "#475569", fontSize: 14 }} className="mt-2">يحصل كلاكما على <span style={{ fontFamily: "Inter", fontWeight: 700 }}>5</span> دنانير رصيد خدمة عند أول حجز لصديقك.</p>
        <Card className="mt-6 p-4 flex items-center gap-2">
          <span className="flex-1 text-start" style={{ fontFamily: "Inter", fontWeight: 700, fontSize: 18, letterSpacing: 2 }}>AHMED5</span>
          <button onClick={() => notify("تم نسخ رمز الدعوة", "success")} style={{ color: "#1366D6", fontWeight: 600, fontSize: 13 }}>نسخ</button>
        </Card>
      </div>
      <FullCTA onClick={() => notify("فتح مشاركة الدعوة…")}>مشاركة رمز الدعوة</FullCTA>
    </div>
  );
}


