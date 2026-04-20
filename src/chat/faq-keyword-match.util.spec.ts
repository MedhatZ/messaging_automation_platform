import { normalizeArabic } from '../common/normalize-arabic';
import {
  fuzzyKeywordMatch,
  normalizeForFaqMatch,
} from './faq-keyword-match.util';

describe('normalizeArabic', () => {
  it('applies Arabic normalization rules', () => {
    expect(normalizeArabic('  أإآ ة ى  ')).toBe('ااا ه ي');
  });
});

describe('FAQ fuzzy matching', () => {
  it('matches Arabic partial keyword (الدفع ازاي -> دفع)', () => {
    const msg = normalizeForFaqMatch('الدفع ازاي', 'ar');
    expect(fuzzyKeywordMatch(msg, 'دفع', 'ar')).toBe(true);
  });

  it('matches Arabic partial keyword (عايز ادفع -> دفع)', () => {
    const msg = normalizeForFaqMatch('عايز ادفع', 'ar');
    expect(fuzzyKeywordMatch(msg, 'دفع', 'ar')).toBe(true);
  });

  it('matches English partial keyword (payment methods -> payment)', () => {
    const msg = normalizeForFaqMatch('payment methods', 'en');
    expect(fuzzyKeywordMatch(msg, 'payment', 'en')).toBe(true);
  });

  it('ignores word order for multi-word keywords', () => {
    const msg = normalizeForFaqMatch('methods payment', 'en');
    expect(fuzzyKeywordMatch(msg, 'payment methods', 'en')).toBe(true);
  });
});

