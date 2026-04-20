/**
 * Only `active` accounts receive webhooks (routing) and outbound sends.
 * Use `inactive` or `disabled` to turn a number off without deleting it.
 */
export const WHATSAPP_ACCOUNT_STATUS_ACTIVE = 'active';

export function isWhatsappAccountActiveForOps(
  status: string | null | undefined,
): boolean {
  return (status ?? '').toLowerCase() === WHATSAPP_ACCOUNT_STATUS_ACTIVE;
}
