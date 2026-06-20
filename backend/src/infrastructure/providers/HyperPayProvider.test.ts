import { createCipheriv, randomBytes } from 'crypto';
import { HyperPayProvider, classifyResultCode, type HyperPayConfig } from './HyperPayProvider';

// 32-byte AES-256 key (hex) for webhook decryption tests.
const KEY_HEX = '0'.repeat(64);

const CONFIG: HyperPayConfig = {
  entityId: 'ent_1',
  accessToken: 'tok_1',
  baseUrl: 'https://eu-test.oppwa.com',
  webhookDecryptKey: KEY_HEX,
  timeoutMs: 1000,
};

/** Build a mocked fetch Response whose text() yields the given JSON. */
function jsonResponse(body: unknown) {
  return { text: async () => JSON.stringify(body) } as unknown as Response;
}

/** Encrypt a notification the way OPPWA does (AES-256-GCM, hex body + IV/tag headers). */
function encryptNotification(payload: unknown, keyHex = KEY_HEX) {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    rawBody: Buffer.from(ciphertext.toString('hex')), // body is the hex string bytes
    headers: {
      'x-initialization-vector': iv.toString('hex'),
      'x-authentication-tag': authTag.toString('hex'),
    } as Record<string, string | undefined>,
  };
}

describe('classifyResultCode', () => {
  it('classifies successes', () => {
    for (const c of ['000.000.000', '000.100.110', '000.300.000', '000.400.000']) {
      expect(classifyResultCode(c)).toBe('success');
    }
  });
  it('classifies pending', () => {
    for (const c of ['000.200.000', '000.200.100', '100.400.500', '800.400.500']) {
      expect(classifyResultCode(c)).toBe('pending');
    }
  });
  it('classifies rejections (and unknown codes default to rejected)', () => {
    for (const c of ['800.100.150', '800.800.400', '100.396.101', '900.100.300', 'zzz']) {
      expect(classifyResultCode(c)).toBe('rejected');
    }
  });
});

describe('HyperPayProvider', () => {
  const provider = new HyperPayProvider(CONFIG);
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
  });

  it('is hosted mode and rejects instant preAuthorize', async () => {
    expect(provider.mode).toBe('hosted');
    await expect(provider.preAuthorize()).rejects.toThrow(/hosted checkout/i);
  });

  describe('prepareCheckout', () => {
    it('POSTs a PA checkout with a 3-decimal JOD amount + merchantTransactionId', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ id: 'co_1', result: { code: '000.200.100' } }));
      const res = await provider.prepareCheckout({ bookingId: 'bk_1', amountJod: 92, currency: 'JOD' });
      expect(res).toEqual({ checkoutId: 'co_1', scriptUrl: 'https://eu-test.oppwa.com/v1/paymentWidgets.js', brands: ['VISA', 'MASTER'] });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://eu-test.oppwa.com/v1/checkouts');
      expect(init.method).toBe('POST');
      expect(init.body).toContain('amount=92.000');
      expect(init.body).toContain('paymentType=PA');
      expect(init.body).toContain('merchantTransactionId=bk_1');
      expect(init.headers.Authorization).toBe('Bearer tok_1');
    });

    it('throws when the checkout cannot be created', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ result: { code: '800.900.300', description: 'invalid auth' } }));
      await expect(provider.prepareCheckout({ bookingId: 'bk_1', amountJod: 10, currency: 'JOD' })).rejects.toThrow(/prepareCheckout failed/);
    });
  });

  describe('getCheckoutResult', () => {
    it('maps an authorized result with card metadata', async () => {
      fetchMock.mockResolvedValue(jsonResponse({
        id: 'pay_1', result: { code: '000.100.110', description: 'ok' },
        amount: '92.000', currency: 'JOD', paymentBrand: 'VISA', card: { last4Digits: '0001' },
      }));
      const res = await provider.getCheckoutResult('co_1');
      expect(res).toMatchObject({ state: 'authorized', providerRef: 'pay_1', amountJod: 92, currency: 'JOD', cardBrand: 'VISA', cardLast4: '0001' });
    });

    it('maps pending and rejected outcomes', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'p', result: { code: '000.200.000' } }));
      expect((await provider.getCheckoutResult('co_1')).state).toBe('pending');
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'p', result: { code: '800.100.150' } }));
      expect((await provider.getCheckoutResult('co_1')).state).toBe('rejected');
    });
  });

  describe('back-office ops', () => {
    it('captures with paymentType=CP and surfaces the new transaction id', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ id: 'cap_1', result: { code: '000.100.110' }, amount: '92.000' }));
      const res = await provider.capture('pa_1', 92);
      expect(res).toEqual({ providerRef: 'cap_1', status: 'CAPTURED', capturedAmountJod: 92 });
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://eu-test.oppwa.com/v1/payments/pa_1');
      expect(init.body).toContain('paymentType=CP');
      expect(init.body).toContain('amount=92.000');
    });

    it('throws on a declined capture', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ id: 'x', result: { code: '800.100.151', description: 'declined' } }));
      await expect(provider.capture('pa_1', 92)).rejects.toThrow(/capture failed/);
    });

    it('refunds with paymentType=RF and voids with RV', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ id: 'rf_1', result: { code: '000.100.110' }, amount: '10.000' }));
      await provider.refund('cap_1', 10);
      expect(fetchMock.mock.calls[0][1].body).toContain('paymentType=RF');

      fetchMock.mockResolvedValue(jsonResponse({ id: 'rv_1', result: { code: '000.100.110' } }));
      await provider.void('pa_1');
      expect(fetchMock.mock.calls[1][1].body).toContain('paymentType=RV');
    });
  });

  describe('decodeWebhook (AES-256-GCM)', () => {
    it('decrypts a valid PA-success notification → payment.authorized', () => {
      const { rawBody, headers } = encryptNotification({
        type: 'PAYMENT',
        payload: { id: 'pay_1', paymentType: 'PA', result: { code: '000.100.110' }, merchantTransactionId: 'bk_1', amount: '92.000', currency: 'JOD', paymentBrand: 'VISA', card: { last4Digits: '0001' } },
      });
      const event = provider.decodeWebhook(rawBody, headers);
      expect(event).toMatchObject({ type: 'payment.authorized', providerRef: 'pay_1', bookingId: 'bk_1', amountJod: 92, currency: 'JOD', cardBrand: 'VISA', cardLast4: '0001' });
      expect(event!.eventId).toBe('pay_1:PA');
    });

    it('maps CP→captured, RF→refunded, CD→dispute.opened', () => {
      const mk = (paymentType: string) => {
        const { rawBody, headers } = encryptNotification({ type: 'PAYMENT', payload: { id: 't', paymentType, result: { code: '000.100.110' }, merchantTransactionId: 'bk_1' } });
        return provider.decodeWebhook(rawBody, headers)?.type;
      };
      expect(mk('CP')).toBe('payment.captured');
      expect(mk('RF')).toBe('payment.refunded');
      expect(mk('CD')).toBe('payment.dispute.opened');
    });

    it('rejects a wrong key, a tampered tag, and missing headers', () => {
      const wrong = encryptNotification({ type: 'PAYMENT', payload: { id: 'x', paymentType: 'PA', result: { code: '000.100.110' } } }, 'f'.repeat(64));
      expect(provider.decodeWebhook(wrong.rawBody, wrong.headers)).toBeNull();

      const good = encryptNotification({ type: 'PAYMENT', payload: { id: 'x', paymentType: 'PA', result: { code: '000.100.110' } } });
      const tampered = { ...good.headers, 'x-authentication-tag': 'deadbeef'.repeat(4) };
      expect(provider.decodeWebhook(good.rawBody, tampered)).toBeNull();

      expect(provider.decodeWebhook(good.rawBody, {})).toBeNull();
    });
  });
});
