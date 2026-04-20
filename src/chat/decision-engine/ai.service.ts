import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatLang } from '../../common/detect-message-language';
import { PrismaService } from '../../database/prisma.service';
import type { ProductCard } from './chat-decision.types';

const TIMEOUT_FALLBACK_AR = 'هراجعلك التفاصيل وأرد عليك قريبًا';

@Injectable()
export class ChatAiDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  promptTemplate(input: {
    message: string;
    products: ProductCard[];
    faqs: { q: string; a: string }[];
    history: { role: 'user' | 'assistant'; content: string }[];
  }): string {
    const productsText =
      input.products.length === 0
        ? '- (no products)\n'
        : input.products
            .map((p) => `- ${p.name} | ${p.price} EGP`)
            .join('\n') + '\n';

    const faqText =
      input.faqs.length === 0
        ? '- (no faqs)\n'
        : input.faqs
            .slice(0, 40)
            .map((f) => `- Q: ${f.q}\n  A: ${f.a}`)
            .join('\n') + '\n';

    const historyText =
      input.history.length === 0
        ? '(no history)\n'
        : input.history
            .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
            .join('\n') + '\n';

    return `You are a sales assistant.
Answer in Arabic.
Be short and helpful.
Use available products and FAQ when possible.

Rules:
- Prefer FAQ answers if relevant.
- Suggest products if the question relates.
- Never hallucinate prices. Only use the exact prices provided in PRODUCTS.
- If the user asks for something unknown, say you will check and respond later.

PRODUCTS (name | price):
${productsText}

FAQS:
${faqText}

CONVERSATION HISTORY (last messages):
${historyText}

USER MESSAGE:
${input.message}`;
  }

  async ask(
    message: string,
    context: {
      tenantId: string;
      lang: ChatLang;
      products: ProductCard[];
      faqs: { q: string; a: string }[];
      history: { role: 'user' | 'assistant'; content: string }[];
    },
  ): Promise<string> {
    const apiKey =
      this.config.get<string>('openai.apiKey', { infer: true }) ?? '';
    if (!apiKey.trim()) {
      return TIMEOUT_FALLBACK_AR;
    }

    const model =
      this.config.get<string>('openai.model', { infer: true }) ?? 'gpt-4o-mini';
    const timeoutMs = Math.max(
      500,
      Number(this.config.get<number>('openai.timeoutMs', { infer: true }) ?? 6000),
    );

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const prompt = this.promptTemplate({
        message,
        products: context.products,
        faqs: context.faqs,
        history: context.history,
      });

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: 'Follow the instructions exactly.' },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!res.ok) {
        return TIMEOUT_FALLBACK_AR;
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data?.choices?.[0]?.message?.content?.trim();
      return text && text.length > 0 ? text : TIMEOUT_FALLBACK_AR;
    } catch {
      return TIMEOUT_FALLBACK_AR;
    } finally {
      clearTimeout(t);
    }
  }
}

