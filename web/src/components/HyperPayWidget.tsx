import { useEffect } from 'react';
import type { CheckoutSession } from '../lib/api';

interface HyperPayWidgetProps {
  session: CheckoutSession;
  /** Where HyperPay redirects after the customer submits the card form. */
  returnUrl: string;
}

/**
 * Mounts HyperPay's COPYandPAY payment widget. The card fields render inside HyperPay's
 * own iframe (so the PAN never touches our page — PCI SAQ-A). On submit the widget
 * redirects the browser to `returnUrl` with the result, where we finalize the checkout.
 *
 * The integration is script-driven: we inject
 *   <script src="{scriptUrl}?checkoutId=…">
 * and render a <form class="paymentWidgets"> that the script populates.
 */
export default function HyperPayWidget({ session, returnUrl }: HyperPayWidgetProps) {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = `${session.scriptUrl}?checkoutId=${encodeURIComponent(session.checkoutId)}`;
    script.async = true;
    document.body.appendChild(script);
    return () => {
      // Remove the script + any widget globals it installed so re-mounting (e.g. a retry
      // with a fresh checkoutId) starts clean instead of reusing the stale session.
      script.remove();
      delete (window as unknown as Record<string, unknown>).wpwlOptions;
      delete (window as unknown as Record<string, unknown>).wpwl;
    };
  }, [session.checkoutId, session.scriptUrl]);

  return (
    <form
      action={returnUrl}
      className="paymentWidgets"
      data-brands={session.brands.join(' ')}
    />
  );
}
