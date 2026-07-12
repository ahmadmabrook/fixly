import { FileText } from 'lucide-react';
import { Card } from '../components/shared';

const SECTIONS: ReadonlyArray<{ title: string; body: string }> = [
  { title: '1. الخدمة', body: 'تتيح Fixly حجز فنيي صيانة منزلية معتمدين (كهرباء، سباكة، تكييف، دهان، تركيب أثاث) عبر التطبيق والموقع، مع سعر ثابت يُعرض قبل تأكيد الحجز.' },
  { title: '2. الحجز والدفع', body: 'يتم تأكيد الحجز بعد إدخال بيانات الدفع؛ يُحجز المبلغ عند التأكيد ولا يُخصم فعلياً إلا بعد إتمام الخدمة، وفق ما هو موضّح في صفحة الحجز.' },
  { title: '3. الإلغاء والاسترداد', body: 'يمكن إلغاء الحجز قبل بدء الفني بالعمل مجاناً. بعد وصول الفني قد تُطبّق رسوم كشف حسب سياسة الاسترجاع المعروضة عند الإلغاء.' },
  { title: '4. الضمان', body: 'كل خدمة مضمونة لمدة 30 يوماً من تاريخ إتمامها ضد أي خلل متعلق بالإصلاح نفسه، حسب الشروط الموضحة في صفحة الضمان.' },
  { title: '5. سلوك المستخدم', body: 'يلتزم المستخدم والفني بالتعامل باحترام. أي إساءة أو محاولة تعامل خارج المنصة يمكن الإبلاغ عنها من صفحة تتبّع الطلب.' },
  { title: '6. التعديلات', body: 'قد تُحدَّث هذه الشروط من وقت لآخر لتطوير الخدمة؛ سيتم إشعارك بأي تغييرات جوهرية عبر التطبيق.' },
];

export default function TermsPage() {
  return (
    <main className="max-w-[800px] mx-auto px-6 py-10">
      <div className="flex items-center gap-2">
        <FileText size={26} color="#1366D6" aria-hidden="true" />
        <h1 style={{ fontWeight: 800, fontSize: 28 }}>الشروط والأحكام</h1>
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
