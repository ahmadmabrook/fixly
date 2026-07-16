import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Drawer } from './shared';

/**
 * The five admin detail drawers (bookings, technicians, customers, quality,
 * guarantee) previously hand-rolled their overlay and were not keyboard
 * operable. These tests lock in the accessibility contract of the shared
 * Drawer so a future page can't quietly regress it.
 */
describe('Drawer', () => {
  it('exposes an accessible modal dialog with a name', () => {
    render(
      <Drawer ariaLabel="تفاصيل الحجز" onClose={() => {}}>
        <button>إغلاق</button>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog', { name: 'تفاصيل الحجز' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <Drawer ariaLabel="ملف الفني" onClose={onClose}>
        <button>إغلاق</button>
      </Drawer>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the drawer on open', () => {
    render(
      <Drawer ariaLabel="ملف الفني" onClose={() => {}}>
        <button>الإجراء الأول</button>
        <button>إغلاق</button>
      </Drawer>,
    );
    expect(screen.getByText('الإجراء الأول')).toHaveFocus();
  });

  it('traps Tab within the drawer (last → first)', () => {
    render(
      <Drawer ariaLabel="ملف الفني" onClose={() => {}}>
        <button>الأول</button>
        <button>الأخير</button>
      </Drawer>,
    );
    const first = screen.getByText('الأول');
    const last = screen.getByText('الأخير');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
  });

  it('traps Shift+Tab within the drawer (first → last)', () => {
    render(
      <Drawer ariaLabel="ملف الفني" onClose={() => {}}>
        <button>الأول</button>
        <button>الأخير</button>
      </Drawer>,
    );
    const first = screen.getByText('الأول');
    const last = screen.getByText('الأخير');
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('restores focus to the trigger when unmounted', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <Drawer ariaLabel="ملف الفني" onClose={() => {}}>
        <button>إغلاق</button>
      </Drawer>,
    );
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('closes when the scrim is clicked but not when the panel is', () => {
    const onClose = vi.fn();
    render(
      <Drawer ariaLabel="ملف الفني" onClose={onClose}>
        <button>إغلاق</button>
      </Drawer>,
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
