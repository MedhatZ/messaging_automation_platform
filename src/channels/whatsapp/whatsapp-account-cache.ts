import type { WhatsappAccount } from '@prisma/client';

export type CachedWhatsappAccountFields = Pick<
  WhatsappAccount,
  'id' | 'tenantId' | 'metaPhoneNumberId' | 'status'
>;

export const WHATSAPP_PHONE_CACHE_PREFIX = 'wa:';
export const WHATSAPP_PHONE_CACHE_TTL_SEC = 300;

export function whatsappPhoneCacheKey(metaPhoneNumberId: string): string {
  return `${WHATSAPP_PHONE_CACHE_PREFIX}${metaPhoneNumberId}`;
}

export function serializeWhatsappAccountForCache(
  row: CachedWhatsappAccountFields,
): string {
  return JSON.stringify({
    id: row.id,
    tenantId: row.tenantId,
    metaPhoneNumberId: row.metaPhoneNumberId,
    status: row.status,
  });
}

export function parseWhatsappAccountFromCache(
  raw: string,
): CachedWhatsappAccountFields | null {
  try {
    const o: unknown = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    const rec = o as Record<string, unknown>;
    if (
      typeof rec.id !== 'string' ||
      typeof rec.tenantId !== 'string' ||
      typeof rec.metaPhoneNumberId !== 'string' ||
      typeof rec.status !== 'string'
    ) {
      return null;
    }
    return {
      id: rec.id,
      tenantId: rec.tenantId,
      metaPhoneNumberId: rec.metaPhoneNumberId,
      status: rec.status,
    };
  } catch {
    return null;
  }
}
