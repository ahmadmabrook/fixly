import { useNavigate } from 'react-router-dom';
import { useT } from '../lib/i18n';

interface FooterLink { label: string; to?: string; href?: string }
interface FooterColumn { title: string; items: FooterLink[] }

interface FooterProps {
  authed: boolean;
  onRequireLogin: (returnTo: string) => void;
}

// Service footer labels map 1:1 to the backend `Service.category` enum
// (see backend/src/infrastructure/database/seed.ts) so the link lands on a
// pre-filtered catalog, not just the bare /services page.
const SERVICE_CATEGORIES: ReadonlyArray<readonly [string, string]> = [
  ['svc.elec', 'ELECTRICAL'],
  ['svc.plumb', 'PLUMBING'],
  ['svc.ac', 'HVAC'],
  ['svc.paint', 'PAINTING'],
  ['svc.furn', 'CARPENTRY'],
];

export default function Footer({ authed, onRequireLogin }: FooterProps) {
  const t = useT();
  const navigate = useNavigate();

  const columns: FooterColumn[] = [
    {
      title: t('footer.company'),
      items: [
        { label: t('footer.about'), to: '/about' },
        { label: t('footer.careers'), to: '/careers' },
        { label: t('footer.blog'), to: '/blog' },
      ],
    },
    {
      title: t('footer.servicesCol'),
      items: SERVICE_CATEGORIES.map(([labelKey, category]) => ({
        label: t(labelKey),
        to: `/services?category=${encodeURIComponent(category)}`,
      })),
    },
    {
      title: t('footer.support'),
      items: [
        { label: t('footer.help'), to: '/help' },
        { label: t('nav.guarantee'), to: '/guarantee' },
        { label: t('footer.contact'), to: '/contact' },
        { label: '+962 6 555 0000', href: 'tel:+96265550000' },
      ],
    },
  ];

  function go(link: FooterLink) {
    if (link.href) return; // plain <a>, browser handles it (tel:/mailto:)
    if (!link.to) return;
    if (link.to === '/guarantee' && !authed) {
      onRequireLogin('/guarantee');
      return;
    }
    navigate(link.to);
  }

  return (
    <footer className="mt-10 border-t border-slate-200 bg-white">
      <div className="max-w-[1200px] mx-auto px-6 py-10 grid md:grid-cols-4 gap-6">
        <div>
          <button onClick={() => navigate('/')} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#1366D6' }} aria-hidden="true">🔧</div>
            <span style={{ color: '#1366D6', fontWeight: 800, fontSize: 22 }}>Fixly</span>
          </button>
          <p className="mt-3" style={{ color: '#475569', fontSize: 13 }}>{t('footer.tagline')}</p>
        </div>
        {columns.map((c) => (
          <div key={c.title}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{c.title}</div>
            <ul className="mt-3 space-y-1.5">
              {c.items.map((item) => (
                <li key={item.label}>
                  {item.href ? (
                    <a href={item.href} style={{ color: '#475569', fontSize: 13 }} dir="ltr">{item.label}</a>
                  ) : (
                    <button onClick={() => go(item)} style={{ color: '#475569', fontSize: 13 }}>{item.label}</button>
                  )}
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
