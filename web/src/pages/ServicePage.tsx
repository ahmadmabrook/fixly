import { ChevronLeft, Clock, ShieldCheck, Check, CreditCard, Video, AlertCircle, X, BadgeCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useService } from '../hooks/useServices';
import { api, Subscription } from '../lib/api';
import { useAuth } from '../lib/store';
import { Card, ServiceIcon, PriceBadge } from '../components/shared';
import { DEFAULT_GUARANTEE_DAYS, DEFAULT_PROTECTION_DISCOUNT_PERCENT, PROTECTION_GUARANTEE_DAYS } from '../lib/constants';
import { COLOR_BRAND_PRIMARY, COLOR_BRAND_PRIMARY_DARK, COLOR_BRAND_PRIMARY_TINT, COLOR_DESTRUCTIVE_ACCENT, COLOR_ERROR_TEXT, COLOR_SUCCESS_TEXT, COLOR_TEXT_MUTED, COLOR_TEXT_SECONDARY, COLOR_WARNING_BG_SOFT, COLOR_WARNING_BORDER, COLOR_WARNING_TEXT, COLOR_WHITE } from '../lib/theme';

interface ServicePageProps {
  serviceId: string;
  onBook: () => void;
  onBack: () => void;
}

const DEFAULT_INCLUDES = ['فحص شامل من فني معتمد', 'إصلاح المشكلة الأساسية', 'اختبار التشغيل', 'ضمان 30 يوم'];

export default function ServicePage({ serviceId, onBook, onBack }: ServicePageProps) {
  const { data: svc, isLoading, isError, error, refetch } = useService(serviceId);
  const accessToken = useAuth((s) => s.accessToken);
  const { data: sub } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => api.get<Subscription | null>('/subscriptions/me'),
    enabled: !!accessToken,
  });
  const member = sub?.status === 'ACTIVE';
  const discountPercent = sub?.discountPercent ?? DEFAULT_PROTECTION_DISCOUNT_PERCENT;
  const guaranteeDays = member ? sub?.guaranteeDays ?? PROTECTION_GUARANTEE_DAYS : DEFAULT_GUARANTEE_DAYS;

  if (isLoading) {
    return (
      <main className="max-w-[1200px] mx-auto px-6 py-16 text-center">
        <p style={{ color: COLOR_TEXT_MUTED }}>جارٍ التحميل...</p>
      </main>
    );
  }

  if (isError || !svc) {
    return (
      <main className="max-w-[1200px] mx-auto px-6 py-16 text-center">
        <p style={{ color: COLOR_ERROR_TEXT }}>تعذّر تحميل الخدمة: {(error as Error | null)?.message ?? 'غير معروفة'}</p>
        <button onClick={() => refetch()} className="mt-3 px-4 py-2 rounded-lg" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE }}>
          إعادة المحاولة
        </button>
      </main>
    );
  }

  return (
    <main className="max-w-[1200px] mx-auto px-6 py-10">
      <button onClick={onBack} className="flex items-center gap-1" style={{ color: COLOR_BRAND_PRIMARY, fontWeight: 600, fontSize: 14 }}>
        <ChevronLeft size={18} aria-hidden="true" /> رجوع
      </button>
      <div className="mt-4 grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <div className="flex items-center gap-4">
            <ServiceIcon nameAr={svc.nameAr} size={32} />
            <div>
              <h1 style={{ fontWeight: 800, fontSize: 32 }}>{svc.nameAr}</h1>
              <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 14 }} className="mt-1">
                المدة المتوقعة: <span style={{ fontFamily: 'Inter' }}>{svc.durationMin}</span> دقيقة
              </div>
            </div>
          </div>
          <Card className="mt-5 p-6">
            <h2 style={{ fontWeight: 700, fontSize: 17 }}>ماذا يشمل</h2>
            <ul className="mt-3 grid sm:grid-cols-2 gap-2">
              {(svc.sopIncludes && svc.sopIncludes.length > 0 ? svc.sopIncludes : DEFAULT_INCLUDES).map((t) => (
                <li key={t} className="flex items-center gap-2" style={{ fontSize: 14 }}>
                  <Check size={15} color={COLOR_SUCCESS_TEXT} aria-hidden="true" /> {t}
                </li>
              ))}
            </ul>
          </Card>
          {svc.sopExcludes && svc.sopExcludes.length > 0 && (
            <Card className="mt-4 p-6">
              <h2 style={{ fontWeight: 700, fontSize: 17 }}>لا يشمل</h2>
              <ul className="mt-3 grid sm:grid-cols-2 gap-2">
                {svc.sopExcludes.map((t) => (
                  <li key={t} className="flex items-center gap-2" style={{ fontSize: 14, color: COLOR_TEXT_SECONDARY }}>
                    <X size={15} color={COLOR_DESTRUCTIVE_ACCENT} aria-hidden="true" /> {t}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {svc.calloutFeeJod != null && Number(svc.calloutFeeJod) > 0 && (
            <div className="mt-4 flex items-start gap-2 p-4 rounded-2xl" style={{ background: COLOR_WARNING_BG_SOFT, border: `1px solid ${COLOR_WARNING_BORDER}` }}>
              <AlertCircle size={18} color={COLOR_WARNING_TEXT} className="shrink-0 mt-0.5" aria-hidden="true" />
              <p style={{ color: COLOR_WARNING_TEXT, fontSize: 13, fontWeight: 600 }}>
                رسوم كشف <span style={{ fontFamily: 'Inter' }}>{Number(svc.calloutFeeJod)}</span> دينار تُخصم من قيمة الإصلاح.
              </p>
            </div>
          )}
          {svc.descriptionAr && (
            <Card className="mt-4 p-6">
              <p style={{ fontSize: 14, color: COLOR_TEXT_SECONDARY }}>{svc.descriptionAr}</p>
            </Card>
          )}
          <Link
            to="/quotes"
            className="mt-4 flex items-center gap-2 px-4 h-11 rounded-xl w-fit"
            style={{ background: COLOR_BRAND_PRIMARY_TINT, color: COLOR_BRAND_PRIMARY_DARK, fontWeight: 600, fontSize: 14 }}
          >
            <Video size={16} aria-hidden="true" /> لست متأكداً من المشكلة؟ اطلب فحصاً مرئياً
          </Link>
        </div>

        <Card className="p-6 h-fit sticky top-20">
          <div style={{ color: COLOR_TEXT_SECONDARY, fontSize: 13 }}>السعر الثابت</div>
          <div className="mt-1"><PriceBadge amount={Number(svc.priceJod)} big /></div>
          {member && (
            <div className="mt-1" style={{ color: COLOR_SUCCESS_TEXT, fontSize: 13, fontWeight: 700 }}>
              خصم العضوية −<span style={{ fontFamily: 'Inter' }}>{discountPercent}</span>% مُطبّق عند الحجز
            </div>
          )}
          <div className="my-4 h-px bg-slate-100" />
          <ul className="space-y-2" style={{ fontSize: 13, color: COLOR_TEXT_SECONDARY }}>
            <li className="flex items-center gap-2"><Clock size={14} aria-hidden="true" /> فوراً خلال 30 دقيقة</li>
            <li className="flex items-center gap-2"><BadgeCheck size={14} color={COLOR_BRAND_PRIMARY} aria-hidden="true" /> فني معتمد Fixly Certified</li>
            <li className="flex items-center gap-2"><ShieldCheck size={14} color={COLOR_SUCCESS_TEXT} aria-hidden="true" /> ضمان <span style={{ fontFamily: 'Inter' }}>{guaranteeDays}</span> يوم مشمول</li>
            <li className="flex items-center gap-2"><CreditCard size={14} aria-hidden="true" /> دفع آمن</li>
          </ul>
          <button onClick={onBook} className="mt-5 w-full h-12 rounded-xl" style={{ background: COLOR_BRAND_PRIMARY, color: COLOR_WHITE, fontWeight: 700 }}>
            اطلب الآن
          </button>
        </Card>
      </div>
    </main>
  );
}
