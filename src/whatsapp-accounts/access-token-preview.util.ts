export function accessTokenLast4FromPlain(plain: string): string | null {
  const t = plain.trim();
  if (t.length < 4) return null;
  return t.slice(-4);
}

export function formatTokenMask(last4: string | null | undefined): string {
  if (!last4 || last4.length === 0) return '—';
  return `****${last4}`;
}
