/**
 * If the message contains Arabic script, treat as Arabic; otherwise English.
 * Simple heuristic — numbers-only or punctuation-only fall through to English.
 */
export type ChatLang = 'ar' | 'en';

const ARABIC_SCRIPT =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function detectMessageLanguage(text: string): ChatLang {
  if (!text || !text.trim()) {
    return 'en';
  }
  return ARABIC_SCRIPT.test(text) ? 'ar' : 'en';
}
