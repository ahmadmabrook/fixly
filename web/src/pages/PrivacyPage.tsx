import { ShieldCheck } from 'lucide-react';
import { Card } from '../components/shared';

const SECTIONS: ReadonlyArray<{ title: string; body: string }> = [
  { title: '1. البيانات التي نجمعها', body: 'رقم الهاتف، الاسم، العناوين، وسجل الحجوزات — فقط ما يلزم لتقديم الخدمة وتحسينها.' },
  { title: '2. كيف نستخدم بياناتك', body: 'لإتمام الحجوزات، توصيلك بالفني المناسب، إرسال إشعارات حالة الطلب، ودعمك عبر مركز المساعدة.' },
  { title: '3. الدفع', body: 'لا يتم تخزين رقم البطاقة كاملاً على خوادمنا — تتم معالجة الدفع عبر مزود دفع معتمد وفق معايير الأمان القياسية.' },
  { title: '4. مشاركة البيانات', body: 'نشارك الحد الأدنى من بياناتك (الاسم والموقع التقريبي) مع الفني المكلّف بطلبك فقط، ولا نبيع بياناتك لأي جهة خارجية.' },
  { title: '5. حقوقك', body: 'يمكنك تعديل بياناتك من صفحة الحساب، أو طلب حذف حسابك نهائياً من قسم الإعدادات في أي وقت.' },
];

export default function PrivacyPage() {
  return (
    <main className="max-w-[800px] mx-auto px-6 py-10">
      <div className="flex items-center gap-2">
        <ShieldCheck size={26} color="#15803D" aria-hidden="true" />
        <h1 style={{ fontWeight: 800, fontSize: 28 }}>سياسة الخصوصية</h1>
      </div>
      <p className="mt-2" style={{ color: '#475569', fontSize: 13 }}>آخر تحديث: يناير 2026</p>

      <div className="mt-6 space-y-3">
        {SECTIONS.map((s) => (
          <Card key={s.title} className="p-5">
            <div style={{ fontWeight: 700, fontSize: 15 }}>{s.title}</div>
            <p className="mt-1.5" style={{ color: '#475569', fontSize: 14, lineHeight: 1.7 }}>{s.body}</p>
          </Card>
        ))}
      </div>
    </main>
  );
}
