import { useT } from '../lib/i18n';

export default function Footer() {
  const t = useT();
  const columns = [
    { title: t('footer.company'), items: [t('footer.about'), t('footer.careers'), t('footer.blog')] },
    { title: t('footer.servicesCol'), items: [t('svc.elec'), t('svc.plumb'), t('svc.ac'), t('svc.paint'), t('svc.furn')] },
    { title: t('footer.support'), items: [t('footer.help'), t('nav.guarantee'), t('footer.contact'), '+962 6 555 0000'] },
  ];
  return (
    <footer className="mt-10 border-t border-slate-200 bg-white">
      <div className="max-w-[1200px] mx-auto px-6 py-10 grid md:grid-cols-4 gap-6">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#1366D6' }} aria-hidden="true">🔧</div>
            <span style={{ color: '#1366D6', fontWeight: 800, fontSize: 22 }}>Fixly</span>
          </div>
          <p className="mt-3" style={{ color: '#475569', fontSize: 13 }}>{t('footer.tagline')}</p>
        </div>
        {columns.map((c) => (
          <div key={c.title}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{c.title}</div>
            <ul className="mt-3 space-y-1.5">
              {c.items.map((i) => (
                <li key={i}>
                  <span style={{ color: '#475569', fontSize: 13 }}>{i}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200 py-4 text-center" style={{ color: '#94A3B8', fontSize: 12 }}>
        {t('footer.rights')}
      </div>
    </footer>
  );
}
