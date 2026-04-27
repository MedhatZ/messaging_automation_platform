import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const HOT_KEYWORDS_AR = [
  'تمام',
  'هشتري',
  'عايز',
  'عاوز',
  'موافق',
  'اوكي',
  'أوكي',
  'يلا',
  'خلاص',
  'هاخد',
  'محتاجه',
  'محتاجها',
  'ابعتلي',
  'ابعت',
];

const HOT_KEYWORDS_EN = [
  'ok',
  'okay',
  'yes',
  'sure',
  'buy',
  'want',
  'deal',
  'send',
  'confirm',
];

@Injectable()
export class LeadClassifierService {
  constructor(private readonly prisma: PrismaService) {}

  classify(message: string): 'hot' | 'interested' | null {
    const lower = message.toLowerCase().trim();

    const isHot =
      HOT_KEYWORDS_AR.some((w) => message.includes(w)) ||
      HOT_KEYWORDS_EN.some((w) => lower.includes(w));

    if (isHot) return 'hot';
    return null;
  }

  async updateLeadStatus(
    conversationId: string,
    newStatus: 'interested' | 'hot',
  ): Promise<void> {
    // لو العميل hot، مترجعش لـ interested تاني
    if (newStatus === 'interested') {
      const current = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { leadStatus: true },
      });
      if (current?.leadStatus === 'hot') return;
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { leadStatus: newStatus },
    });
  }
}

