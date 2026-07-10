import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { User, MapPin, CreditCard, Bell, LifeBuoy, Settings as SettingsIcon, ShieldCheck, Gift, Receipt, Wallet, Star } from 'lucide-react';
import { api } from '../lib/api';
import { Card, Avatar } from '../components/shared';
import { ProfileTab } from './account/ProfileTab';
import { ProtectionTab } from './account/ProtectionTab';
import { AddressesTab } from './account/AddressesTab';
import { PaymentTab } from './account/PaymentTab';
import { ReceiptsTab } from './account/ReceiptsTab';
import { NotificationsTab } from './account/NotificationsTab';
import { SupportTab } from './account/SupportTab';
import { SettingsTab } from './account/SettingsTab';

type Tab = 'profile' | 'protection' | 'referral' | 'addresses' | 'payment' | 'receipts' | 'notifications' | 'support' | 'settings';
const TABS: ReadonlyArray<readonly [Tab, string, typeof User]> = [
  ['profile', 'حسابي', User],
  ['protection', 'الحماية', ShieldCheck],
  ['referral', 'الإحالة', Gift],
  ['addresses', 'العناوين', MapPin],
  ['payment', 'الدفع', CreditCard],
  ['receipts', 'الفواتير', Receipt],
  ['notifications', 'الإشعارات', Bell],
  ['support', 'الدعم', LifeBuoy],
  ['settings', 'الإعدادات', SettingsIcon],
];

export default function Account() {
  const [tab, setTab] = useState<Tab>('profile');
  const navigate = useNavigate();
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api.get<{ name: string | null; phone: string }>('/auth/me') });
  const { data: sub } = useQuery({ queryKey: ['subscription'], queryFn: () => api.get<{ status: string } | null>('/subscriptions/me') });
  const { data: credits } = useQuery({ queryKey: ['credits'], queryFn: () => api.get<{ balanceJod: string | number }>('/credits/me') });
  const member = sub?.status === 'ACTIVE';
  const balance = Number(credits?.balanceJod ?? 0);

  function selectTab(k: Tab) {
    // The referral program lives on its own route (shareable, deep-linkable)
    // rather than an in-page panel, so route there instead of switching tabs.
    if (k === 'referral') {
      navigate('/referral');
      return;
    }
    setTab(k);
  }

  return (
    <main className="max-w-[1200px] mx-auto px-6 py-8">
      <div className="flex items-center gap-3">
        <Avatar name={me?.name ?? 'حسابي'} size={48} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 style={{ fontWeight: 800, fontSize: 24 }}>{me?.name ?? 'حسابي'}</h1>
            {member && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: '#FEF3C7', color: '#B45309', fontSize: 11, fontWeight: 700 }}>
                <Star size={11} fill="#F5A623" strokeWidth={0} aria-hidden="true" /> عضو الحماية
              </span>
            )}
          </div>
          {me?.phone && <div style={{ color: '#475569', fontSize: 13, fontFamily: 'Inter' }} dir="ltr">{me.phone}</div>}
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0" style={{ background: '#E8F1FE', color: '#1366D6', fontSize: 13, fontWeight: 700 }}>
          <Wallet size={15} aria-hidden="true" /> رصيدك: <span style={{ fontFamily: 'Inter' }}>{balance}</span> دينار
        </span>
      </div>

      <div className="mt-6 grid md:grid-cols-[220px_1fr] gap-6">
        <Card className="p-2 h-fit" role="tablist" aria-label="أقسام الحساب">
          {TABS.map(([k, label, Icon]) => (
            <button
              key={k}
              role="tab"
              id={`tab-${k}`}
              aria-selected={tab === k}
              aria-controls={`tabpanel-${k}`}
              onClick={() => selectTab(k)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-start"
              style={{ background: tab === k ? '#E8F1FE' : 'transparent', color: tab === k ? '#1366D6' : '#475569', fontWeight: tab === k ? 700 : 600, fontSize: 14 }}
            >
              <Icon size={17} aria-hidden="true" /> {label}
            </button>
          ))}
        </Card>

        <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === 'profile' && <ProfileTab />}
          {tab === 'protection' && <ProtectionTab />}
          {tab === 'addresses' && <AddressesTab />}
          {tab === 'payment' && <PaymentTab />}
          {tab === 'receipts' && <ReceiptsTab />}
          {tab === 'notifications' && <NotificationsTab />}
          {tab === 'support' && <SupportTab />}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </div>
    </main>
  );
}
