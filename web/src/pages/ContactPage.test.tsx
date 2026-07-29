import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ContactPage from './ContactPage';

describe('ContactPage', () => {
  it('lists a WhatsApp deep-link alongside phone and email (§17.9 human support channels)', () => {
    render(<MemoryRouter><ContactPage /></MemoryRouter>);

    const whatsapp = screen.getByRole('link', { name: /واتساب/ });
    expect(whatsapp).toHaveAttribute('href', 'https://wa.me/962795550000');
    expect(screen.getByRole('link', { name: /اتصل بنا/ })).toHaveAttribute('href', 'tel:+96265550000');
    expect(screen.getByRole('link', { name: /راسلنا/ })).toHaveAttribute('href', 'mailto:support@fixly.jo');
  });
});
