import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { ChatLang } from '../common/detect-message-language';
import {
  fuzzyKeywordMatch,
  normalizeForFaqMatch,
} from './faq-keyword-match.util';

export type MatchMessageInput = {
  tenantId: string;
  message: string;
  lang: ChatLang;
};

export type MatchMessageResult =
  | {
      matched: true;
      type: 'exact' | 'keyword';
      answer: string;
      faqId: string;
    }
  | {
      matched: false;
      type: 'none';
      answer: null;
    };

@Injectable()
export class ChatEngineService {
  constructor(private readonly prisma: PrismaService) {}

  async matchMessage(input: MatchMessageInput): Promise<MatchMessageResult> {
    const normalized = normalizeForFaqMatch(input.message, input.lang);
    if (!normalized) {
      return { matched: false, type: 'none', answer: null };
    }

    const { questionKey, answerKey } = fieldKeys(input.lang);

    const activeFaqs = await this.prisma.faq.findMany({
      where: { tenantId: input.tenantId, isActive: true },
      select: {
        id: true,
        questionAr: true,
        questionEn: true,
        answerAr: true,
        answerEn: true,
        keywordsAr: true,
        keywordsEn: true,
        priority: true,
      },
    });

    const exact = activeFaqs.find((faq) => {
      const q = faq[questionKey] as string;
      return normalizeForFaqMatch(q, input.lang) === normalized;
    });
    if (exact) {
      return {
        matched: true,
        type: 'exact',
        answer: exact[answerKey] as string,
        faqId: exact.id,
      };
    }

    const sorted = [...activeFaqs].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );

    const keywordKey = input.lang === 'ar' ? 'keywordsAr' : 'keywordsEn';
    const keywordHit = sorted.find((faq) => {
      const kws = (faq[keywordKey] as string[]) ?? [];
      return kws.some((kw) => fuzzyKeywordMatch(normalized, kw, input.lang));
    });
    if (keywordHit) {
      return {
        matched: true,
        type: 'keyword',
        answer: keywordHit[answerKey],
        faqId: keywordHit.id,
      };
    }

    return { matched: false, type: 'none', answer: null };
  }
}

function fieldKeys(lang: ChatLang): {
  questionKey: 'questionAr' | 'questionEn';
  answerKey: 'answerAr' | 'answerEn';
} {
  if (lang === 'ar') {
    return {
      questionKey: 'questionAr',
      answerKey: 'answerAr',
    };
  }
  return {
    questionKey: 'questionEn',
    answerKey: 'answerEn',
  };
}
