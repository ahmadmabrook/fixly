import { BookOpen } from 'lucide-react';
import { Card } from '../components/shared';
import { COLOR_BRAND_PRIMARY, COLOR_TEXT_MUTED, COLOR_TEXT_SECONDARY } from '../lib/theme';

const POSTS: ReadonlyArray<{ title: string; excerpt: string; date: string }> = [
  {
    title: '5 نصائح لصيانة مكيفك قبل الصيف',
    excerpt: 'تنظيف الفلاتر ومراجعة غاز التبريد بانتظام يطيل عمر المكيف ويقلل فاتورة الكهرباء.',
    date: '2026-04-02',
  },
  {
    title: 'كيف تختار فنياً موثوقاً لمنزلك؟',
    excerpt: 'تحقق دائماً من التقييمات والتوثيق قبل السماح لأي فني بالدخول إلى منزلك.',
    date: '2026-03-18',
  },
  {
    title: 'علامات تدل على حاجتك لفحص كهربائي',
    excerpt: 'انقطاع متكرر للكهرباء أو رائحة احتراق خفيفة من المقابس علامات لا يجب تجاهلها.',
    date: '2026-02-27',
  },
];

export default function BlogPage() {
  return (
    <main className="max-w-[800px] mx-auto px-6 py-10">
      <div className="flex items-center gap-2">
        <BookOpen size={26} color={COLOR_BRAND_PRIMARY} aria-hidden="true" />
        <h1 style={{ fontWeight: 800, fontSize: 28 }}>المدوّنة</h1>
      </div>
      <p className="mt-2" style={{ color: COLOR_TEXT_SECONDARY, fontSize: 14 }}>نصائح صيانة منزلية من فريق Fixly.</p>

      <div className="mt-6 space-y-3">
        {POSTS.map((p) => (
          <Card key={p.title} className="p-5">
            <div style={{ fontWeight: 700, fontSize: 16 }}>{p.title}</div>
            <div className="mt-1.5" style={{ color: COLOR_TEXT_SECONDARY, fontSize: 13, lineHeight: 1.6 }}>{p.excerpt}</div>
            <div className="mt-2" style={{ color: COLOR_TEXT_MUTED, fontSize: 12, fontFamily: 'Inter' }}>{p.date}</div>
          </Card>
        ))}
      </div>
    </main>
  );
}
