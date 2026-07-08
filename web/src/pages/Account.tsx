import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, MapPin, CreditCard, Bell, LifeBuoy, Settings as SettingsIcon, ShieldCheck, Gift, Receipt } from 'lucide-react';
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
    <main className="max-w-[900px] mx-auto px-6 py-8">
      <h1 style={{ fontWeight: 800, fontSize: 28 }}>حسابي</h1>
      <div className="mt-4 flex gap-2 overflow-x-auto scrollbar-hide flex-nowrap pb-1" role="tablist" aria-label="أقسام الحساب">
        {TABS.map(([k, label, Icon]) => (
          <button
            key={k}
            role="tab"
            id={`tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`tabpanel-${k}`}
            onClick={() => selectTab(k)}
            className="flex items-center gap-1.5 px-4 h-10 rounded-full shrink-0 whitespace-nowrap"
            style={{ background: tab === k ? '#1366D6' : '#FFF', color: tab === k ? '#FFF' : '#475569', fontWeight: 600, fontSize: 13, border: '1px solid #E2E8F0' }}
          >
            <Icon size={15} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      <div className="mt-5" role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'profile' && <ProfileTab />}
        {tab === 'protection' && <ProtectionTab />}
        {tab === 'addresses' && <AddressesTab />}
        {tab === 'payment' && <PaymentTab />}
        {tab === 'receipts' && <ReceiptsTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'support' && <SupportTab />}
        {tab === 'settings' && <SettingsTab />}
      </div>
    </main>
  );
}
