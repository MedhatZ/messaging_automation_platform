/**
 * Thrown when a single Meta send attempt should allow trying another
 * WhatsApp number for the same tenant (fallback).
 */
export class WhatsappApiAttemptError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'WhatsappApiAttemptError';
  }
}
