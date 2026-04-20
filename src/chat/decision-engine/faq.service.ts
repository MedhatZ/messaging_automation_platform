import { Injectable } from '@nestjs/common';
import type { ChatLang } from '../../common/detect-message-language';
import { ChatEngineService } from '../chat-engine.service';

@Injectable()
export class ChatFaqDecisionService {
  constructor(private readonly engine: ChatEngineService) {}

  async tryMatch(input: {
    tenantId: string;
    message: string;
    lang: ChatLang;
  }): Promise<{ matched: true; answer: string } | { matched: false }> {
    const res = await this.engine.matchMessage(input);
    if (!res.matched) return { matched: false };
    return { matched: true, answer: res.answer };
  }
}

