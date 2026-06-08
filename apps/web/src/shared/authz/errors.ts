/**
 * Authorization error hierarchy for the policy layer.
 *
 * Each error carries a clear, actionable message describing who attempted what
 * and why it was denied. Never construct these with a vague message.
 */

export class ForbiddenError extends Error {
  override readonly name = 'ForbiddenError';

  constructor(message: string) {
    super(message);
  }
}

export class LockedError extends Error {
  override readonly name = 'LockedError';

  constructor(message: string) {
    super(message);
  }
}

export class NotFoundError extends Error {
  override readonly name = 'NotFoundError';

  constructor(message: string) {
    super(message);
  }
}
