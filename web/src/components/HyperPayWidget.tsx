import { useEffect, useState } from 'react';
import type { CheckoutSession } from '../lib/api';

interface HyperPayWidgetProps {
  session: CheckoutSession;
  /** Where HyperPay redirects after the customer submits the card form. */
  returnUrl: string;
}

export default function HyperPayWidget({ session, returnUrl }: HyperPayWidgetProps) {
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = `${session.scriptUrl}?checkoutId=${encodeURIComponent(session.checkoutId)}`;
    script.async = true;
    script.onerror = () => setLoadError(true);
    document.body.appendChild(script);
    return () => {
      script.remove();
      delete (window as unknown as Record<string, unknown>).wpwlOptions;
      delete (window as unknown as Record<string, unknown>).wpwl;
    };
  }, [session.checkoutId, session.scriptUrl]);

  if (loadError) {
    return (
      <p style={{ color: '#d03b3b', textAlign: 'center', padding: '1rem' }}>
        فشل تحميل نموذج الدفع. يرجى تحديث الصفحة والمحاولة مرة أخرى.
      </p>
    );
  }

  return (
    <form
      action={returnUrl}
      className="paymentWidgets"
      data-brands={session.brands.join(' ')}
    />
  );
}
