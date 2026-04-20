import type { ChatLang } from '../common/detect-message-language';
import { normalizeArabic } from '../common/normalize-arabic';

function normalizeEnglish(text: string): string {
  return (text ?? '')
    .toString()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeForFaqMatch(text: string, lang: ChatLang): string {
  return lang === 'ar' ? normalizeArabic(text) : normalizeEnglish(text);
}

/**
 * Fuzzy match:
 * - substring matching
 * - ignores word order for multi-word keywords (all tokens must be present anywhere)
 */
export function fuzzyKeywordMatch(
  normalizedMessage: string,
  keyword: string,
  lang: ChatLang,
): boolean {
  const k = normalizeForFaqMatch(keyword, lang);
  if (!k) return false;
  if (!normalizedMessage) return false;

  // Fast path: whole keyword substring
  if (normalizedMessage.includes(k)) return true;

  // Ignore order: ensure every token appears somewhere in the message
  const tokens = k.split(' ').filter(Boolean);
  if (tokens.length <= 1) return false;
  return tokens.every((t) => normalizedMessage.includes(t));
}

