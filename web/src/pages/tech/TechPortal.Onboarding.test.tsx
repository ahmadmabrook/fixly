import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TechPortal from './TechPortal';

/**
 * Dedicated file (rather than adding to TechPortal.test.tsx) because this
 * mocks lib/upload at module scope — TechPortal.ActiveJobs' own checklist
 * tests exercise the REAL uploadFile() against their own presign fetch mock,
 * so sharing this mock would silently break those instead of this scope.
 */
const uploadFileMock = vi.fn();
vi.mock('../../lib/upload', () => ({ uploadFile: (...args: unknown[]) => uploadFileMock(...args) }));

const svc = { id: 'elec', nameAr: 'كهرباء', nameEn: 'Electricity', descriptionAr: null, priceJod: '50', durationMin: 45, isActive: true };

function renderPortal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TechPortal />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.endsWith('/technician/me')) {
        return { ok: false, status: 404, json: async () => ({ error: { message: 'not found' } }) } as Response;
      }
      if (url.endsWith('/services')) {
        return { ok: true, status: 200, json: async () => ({ data: [svc] }) } as Response;
      }
      if (url.endsWith('/technician/onboarding') && method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ data: {} }) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ data: null }) } as Response;
    }) as unknown as typeof fetch,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('TechPortal Onboarding — real media uploads', () => {
  it('uploads the ID photo and intro video via the presign flow and submits their returned URLs', async () => {
    uploadFileMock.mockResolvedValueOnce('https://cdn.example.com/id.jpg').mockResolvedValueOnce('https://cdn.example.com/intro.mp4');
    const user = userEvent.setup();
    renderPortal();

    await screen.findByText('انضم كفني');
    await user.click(await screen.findByText('كهرباء'));
    await user.click(screen.getByRole('checkbox'));

    const idFile = new File(['x'], 'id.jpg', { type: 'image/jpeg' });
    const videoFile = new File(['x'], 'intro.mp4', { type: 'video/mp4' });
    // DOM order: idDoc, certificate, selfie (each a MediaUpload), then the video picker.
    const [idInput, , , videoInput] = document.querySelectorAll('input[type="file"]');
    await user.upload(idInput as HTMLInputElement, idFile);
    await user.upload(videoInput as HTMLInputElement, videoFile);

    expect(uploadFileMock).toHaveBeenCalledWith(idFile, 'kyc_doc');
    expect(uploadFileMock).toHaveBeenCalledWith(videoFile, 'intro_video');
    await screen.findByText('تم رفع الفيديو التعريفي');

    await user.click(screen.getByRole('button', { name: 'إرسال الطلب' }));

    await waitFor(() => {
      const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find((args) => (args[0] as string).endsWith('/technician/onboarding'));
      expect(call).toBeDefined();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.idDocUrl).toBe('https://cdn.example.com/id.jpg');
      expect(body.introVideoUrl).toBe('https://cdn.example.com/intro.mp4');
    });
  });

  it('lets the technician remove an uploaded ID photo before submitting', async () => {
    uploadFileMock.mockResolvedValueOnce('https://cdn.example.com/id.jpg');
    const user = userEvent.setup();
    renderPortal();

    await screen.findByText('انضم كفني');
    const [idInput] = document.querySelectorAll('input[type="file"]');
    await user.upload(idInput as HTMLInputElement, new File(['x'], 'id.jpg', { type: 'image/jpeg' }));

    const removeBtn = await screen.findByRole('button', { name: 'إزالة الصورة' });
    await user.click(removeBtn);

    expect(screen.queryByRole('button', { name: 'إزالة الصورة' })).not.toBeInTheDocument();
  });
});
