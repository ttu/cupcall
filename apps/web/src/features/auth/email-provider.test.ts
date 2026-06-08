import { describe, it, expect, vi } from 'vitest';
import { createSendVerificationRequest, type EmailSender } from './email-provider';

describe('createSendVerificationRequest', () => {
  it('calls the sender exactly once with the correct url and recipient', async () => {
    const fakeSender: EmailSender = {
      send: vi.fn().mockResolvedValue(undefined),
    };
    const sendVerificationRequest = createSendVerificationRequest({
      from: 'noreply@example.com',
      sender: fakeSender,
    });

    const url = 'https://example.com/api/auth/callback/resend?token=abc&callbackUrl=/';
    const identifier = 'alice@example.com';

    await sendVerificationRequest({
      identifier,
      url,
      expires: new Date(),
      provider: {
        id: 'resend',
        type: 'email',
        name: 'Resend',
        from: 'noreply@example.com',
        sendVerificationRequest: vi.fn(),
      },
      token: 'abc',
      theme: { colorScheme: 'auto' },
      request: new Request('http://localhost'),
    });

    expect(fakeSender.send).toHaveBeenCalledOnce();
    const call = vi.mocked(fakeSender.send).mock.calls[0];
    expect(call).toBeDefined();
    expect(call![0]).toMatchObject({
      to: identifier,
      url,
    });
  });

  it('propagates errors from the sender', async () => {
    const fakeSender: EmailSender = {
      send: vi.fn().mockRejectedValue(new Error('send failed')),
    };
    const sendVerificationRequest = createSendVerificationRequest({
      from: 'noreply@example.com',
      sender: fakeSender,
    });

    await expect(
      sendVerificationRequest({
        identifier: 'alice@example.com',
        url: 'https://example.com/api/auth/callback/resend?token=abc',
        expires: new Date(),
        provider: {
          id: 'resend',
          type: 'email',
          name: 'Resend',
          from: 'noreply@example.com',
          sendVerificationRequest: vi.fn(),
        },
        token: 'abc',
        theme: { colorScheme: 'auto' },
        request: new Request('http://localhost'),
      }),
    ).rejects.toThrow('send failed');
  });
});
