import { notify } from './shared';

const COLUMNS = [
  { t: 'الشركة', items: ['عن Fixly', 'الوظائف', 'المدوّنة'] },
  { t: 'الخدمات', items: ['كهرباء', 'سباكة', 'تكييف', 'دهان', 'تركيب أثاث'] },
  { t: 'الدعم', items: ['مركز المساعدة', 'الضمان', 'تواصل معنا', '+962 6 555 0000'] },
];

export default function Footer() {
  return (
    <footer className="mt-10 border-t border-slate-200 bg-white">
      <div className="max-w-[1200px] mx-auto px-6 py-10 grid md:grid-cols-4 gap-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#1366D6' }} aria-hidden="true">🔧</div>
            <span style={{ color: '#1366D6', fontWeight: 800, fontSize: 22 }}>Fixly</span>
          </div>
          <p className="mt-3" style={{ color: '#475569', fontSize: 13 }}>فني محترف خلال 30 دقيقة — في عمّان.</p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.t}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{c.t}</div>
            <ul className="mt-3 space-y-1.5">
              {c.items.map((i) => (
                <li key={i}>
                  <button onClick={() => notify(i)} style={{ color: '#475569', fontSize: 13 }}>{i}</button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200 py-4 text-center" style={{ color: '#94A3B8', fontSize: 12 }}>
        © 2026 Fixly. جميع الحقوق محفوظة.
      </div>
    </footer>
  );
}
