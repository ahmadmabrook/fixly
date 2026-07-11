import { create } from 'zustand';

export type Lang = 'ar' | 'en';

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
}

// EN translation is incomplete — force AR until it's ready. The toggle is
// hidden (TopNav) but the infra (useT, useLang, dictionaries) stays so we
// can re-enable when translation is complete.
const _stored = (typeof localStorage !== 'undefined' ? localStorage.getItem('lang') : null) as Lang | null;
void _stored; // keep lint happy — intentionally unused while EN is disabled

/** App language + direction. Arabic/RTL is the default; English is the LTR
 *  mirror. Switching updates <html dir/lang> so layout flips globally. */
export const useLang = create<LangState>((set) => ({
  lang: 'ar',
  setLang(lang) {
    try {
      localStorage.setItem('lang', lang);
    } catch {
      /* ignore storage errors */
    }
    if (typeof document !== 'undefined') {
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = lang;
    }
    set({ lang });
  },
}));

type Dict = Record<string, string>;

const AR: Dict = {
  // nav
  'nav.home': 'الرئيسية',
  'nav.services': 'الخدمات',
  'nav.bookings': 'طلباتي',
  'nav.guarantee': 'الضمان',
  'nav.account': 'حسابي',
  'nav.tech': 'للفنيين',
  'nav.login': 'تسجيل دخول',
  'nav.logout': 'خروج',
  // hero
  'hero.badge': 'ضمان 30 يوم',
  'hero.title': 'فني محترف',
  'hero.titleAccent': 'خلال 30 دقيقة',
  'hero.sub': 'كهرباء، سباكة، تكييف، دهان وتركيب أثاث — بأسعار ثابتة وضمان 30 يوم.',
  'hero.searchCta': 'اطلب الآن',
  'hero.searchPlaceholder': 'ما الخدمة التي تحتاجها؟',
  // value props
  'vp.certified.t': 'فنيون معتمدون', 'vp.certified.b': 'Fixly Certified — موثّقون قبل الوصول',
  'vp.speed.t': '30 دقيقة', 'vp.speed.b': 'أقرب فني يصلك سريعاً',
  'vp.price.t': 'سعر ثابت', 'vp.price.b': 'بدون مفاجآت أو خفايا',
  'vp.guarantee.t': 'ضمان 30 يوم', 'vp.guarantee.b': 'إصلاح مجاني أو استرداد',
  'vp.support.t': 'دعم 24/7', 'vp.support.b': 'بالعربية وعلى مدار الساعة',
  // sections
  'sec.services': 'خدماتنا',
  'sec.how': 'كيف يعمل التطبيق',
  'sec.reviews': 'آراء العملاء',
  'step.1.t': 'اختر الخدمة', 'step.1.b': 'حدد ما تحتاج من القائمة وشاهد السعر الثابت.',
  'step.2.t': 'حدد الموقع والدفع', 'step.2.b': 'ضع الدبوس على عنوانك واختر طريقة دفع آمنة.',
  'step.3.t': 'تتبّع الفني', 'step.3.b': 'تابع الفني مباشرة على الخريطة حتى وصوله.',
  // catalog
  'catalog.title': 'كل الخدمات',
  'catalog.search': 'ابحث عن خدمة...',
  'catalog.empty': 'لا توجد خدمات مطابقة.',
  'catalog.duration': 'المدة',
  'catalog.minutes': 'دقيقة',
  // footer
  'footer.tagline': 'فني محترف خلال 30 دقيقة — في عمّان.',
  'footer.company': 'الشركة',
  'footer.about': 'عن Fixly', 'footer.careers': 'الوظائف', 'footer.blog': 'المدوّنة',
  'footer.servicesCol': 'الخدمات',
  'footer.support': 'الدعم',
  'footer.help': 'مركز المساعدة', 'footer.contact': 'تواصل معنا',
  'footer.rights': '© 2026 Fixly. جميع الحقوق محفوظة.',
  // service names (catalogue mirror)
  'svc.elec': 'كهرباء', 'svc.plumb': 'سباكة', 'svc.ac': 'تنظيف تكييف', 'svc.paint': 'دهان', 'svc.furn': 'تركيب أثاث',
};

const EN: Dict = {
  'nav.home': 'Home',
  'nav.services': 'Services',
  'nav.bookings': 'My Bookings',
  'nav.guarantee': 'Guarantee',
  'nav.account': 'Account',
  'nav.tech': 'For Technicians',
  'nav.login': 'Log in',
  'nav.logout': 'Log out',
  'hero.badge': '30-Day Guarantee',
  'hero.title': 'A pro technician',
  'hero.titleAccent': 'in 30 minutes',
  'hero.sub': 'Electricity, plumbing, AC, painting and furniture assembly — fixed prices and a 30-day guarantee.',
  'hero.searchCta': 'Book now',
  'hero.searchPlaceholder': 'What service do you need?',
  'vp.certified.t': 'Certified technicians', 'vp.certified.b': 'Fixly Certified — vetted before arrival',
  'vp.speed.t': '30 minutes', 'vp.speed.b': 'The nearest technician, fast',
  'vp.price.t': 'Fixed price', 'vp.price.b': 'No surprises, no hidden fees',
  'vp.guarantee.t': '30-day guarantee', 'vp.guarantee.b': 'Free re-fix or refund',
  'vp.support.t': '24/7 support', 'vp.support.b': 'Around the clock',
  'sec.services': 'Our services',
  'sec.how': 'How it works',
  'sec.reviews': 'What customers say',
  'step.1.t': 'Pick a service', 'step.1.b': 'Choose what you need and see the fixed price.',
  'step.2.t': 'Set location & pay', 'step.2.b': 'Drop a pin on your address and pay securely.',
  'step.3.t': 'Track the technician', 'step.3.b': 'Follow the technician live on the map until arrival.',
  'catalog.title': 'All services',
  'catalog.search': 'Search for a service...',
  'catalog.empty': 'No matching services.',
  'catalog.duration': 'Duration',
  'catalog.minutes': 'min',
  'footer.tagline': 'A pro technician in 30 minutes — in Amman.',
  'footer.company': 'Company',
  'footer.about': 'About Fixly', 'footer.careers': 'Careers', 'footer.blog': 'Blog',
  'footer.servicesCol': 'Services',
  'footer.support': 'Support',
  'footer.help': 'Help center', 'footer.contact': 'Contact us',
  'footer.rights': '© 2026 Fixly. All rights reserved.',
  'svc.elec': 'Electricity', 'svc.plumb': 'Plumbing', 'svc.ac': 'AC Cleaning', 'svc.paint': 'Painting', 'svc.furn': 'Furniture',
};

const DICT: Record<Lang, Dict> = { ar: AR, en: EN };

/** Hook returning the translator for the current language. Falls back to the
 *  raw key (NOT the other language) so an English session never renders Arabic
 *  text in an LTR layout (and vice-versa). */
export function useT() {
  const lang = useLang((s) => s.lang);
  return (key: string): string => DICT[lang][key] ?? key;
}

/** Currency label localized ("دينار" / "JOD"). */
export function useCurrency() {
  const lang = useLang((s) => s.lang);
  return (amount: number | string) => (lang === 'ar' ? `${Number(amount)} دينار` : `JOD ${Number(amount)}`);
}
