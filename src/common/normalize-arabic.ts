const AR_DIACRITICS =
  /[\u064B-\u065F\u0670\u06D6-\u06ED]/g; // harakat + Quranic marks

/**
 * Normalizes Arabic text for matching/search.
 *
 * - lowercase
 * - أ إ آ → ا
 * - ة → ه
 * - ى → ي
 * - removes diacritics if present
 * - trims and collapses whitespace
 */
export function normalizeArabic(text: string): string {
  const raw = (text ?? '').toString();

  const lowered = raw.toLowerCase();

  const mapped = lowered
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\u0640/g, ''); // tatweel

  const withoutDiacritics = mapped.replace(AR_DIACRITICS, '');

  const cleaned = withoutDiacritics
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  return cleaned;
}

