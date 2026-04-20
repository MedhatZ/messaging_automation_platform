import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'sha256=';

/**
 * Validates Meta `X-Hub-Signature-256` (HMAC-SHA256 over the raw request body).
 * Uses length checks and `timingSafeEqual` to reduce timing leaks.
 */
export function verifyMetaXHubSignature256(
  rawBody: Buffer,
  signatureHeader: string | string[] | undefined,
  appSecret: string,
): boolean {
  if (!appSecret || !Buffer.isBuffer(rawBody)) {
    return false;
  }

  const header =
    typeof signatureHeader === 'string'
      ? signatureHeader
      : Array.isArray(signatureHeader)
        ? signatureHeader[0]
        : undefined;

  if (!header?.startsWith(PREFIX)) {
    return false;
  }

  const hexDigest = header.slice(PREFIX.length).trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hexDigest)) {
    return false;
  }

  const received = Buffer.from(hexDigest, 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();

  if (received.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(received, expected);
}
