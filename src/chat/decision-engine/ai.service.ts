import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChatLang } from '../../common/detect-message-language';
import { PrismaService } from '../../database/prisma.service';
import type { ProductCard } from './chat-decision.types';

const TIMEOUT_FALLBACK_AR = 'هراجعلك التفاصيل وأرد عليك قريبًا';

@Injectable()
export class ChatAiDecisionService {
  private readonly logger = new Logger(ChatAiDecisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  promptTemplate(input: {
    products: ProductCard[];
    faqs: { q: string; a: string }[];
    history: { role: 'user' | 'assistant'; content: string }[];
    memory: { role: 'user' | 'assistant'; content: string }[];
  }): string {
    const productsText =
      input.products.length === 0
        ? '- (لا يوجد منتجات)\n'
        : input.products
            .map((p) => `- ${p.name} | السعر: ${p.price} جنيه`)
            .join('\n') + '\n';

    const faqText =
      input.faqs.length === 0
        ? '- (لا يوجد أسئلة شائعة)\n'
        : input.faqs
            .slice(0, 40)
            .map((f) => `سؤال: ${f.q}\nجواب: ${f.a}`)
            .join('\n\n') + '\n';

    const historyText =
      input.history.length === 0
        ? '(no history)\n'
        : input.history
            .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
            .join('\n') + '\n';

    const memoryText =
      input.memory.length === 0
        ? '(no memory)\n'
        : input.memory
            .slice(0, 20)
            .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
            .join('\n') + '\n';

    return `أنت مساعد مبيعات ذكي اسمك "كريم"، بتشتغل على واتساب لبيع منتجات.

## شخصيتك:
- اسمك كريم، مستشار مبيعات محترف ومتمرس.
- بتتكلم بالعربي المصري الطبيعي — ودود، محترم، وذكي.
- بتعامل العميل باحترام تام — متستخدمش كلمات عامية زي "يسطا" أو "يعني إيه".
- ردودك قصيرة وذكية — جملتين أو تلاتة بالكتير.
- مبتكررش كلام ومبتبدأش كل رسالة بـ "وعليكم السلام" — قولها مرة واحدة بس في المحادثة لو العميل سلّم.
- مبتستخدمش إيموجي كتير — واحد أو اتنين بالكتير في الرسالة.

## هدفك: إتمام البيع بدون أي تدخل بشري
اتبع الخطوات دي حسب سياق المحادثة:
1. رحب بشكل طبيعي واسأل العميل عن اللي يحتاجه.
2. افهم احتياجه وقدم المنتج المناسب من القائمة بإيجاز مع أبرز ميزة.
3. لو سأل سؤال، دور في الأسئلة الشائعة الأول وجاوب منها.
4. لو في تردد، رد بثقة وبمعلومة حقيقية من البيانات اللي عندك.
5. لما حسيت إن العميل مهتم، اسأله سؤال إغلاق مباشر زي: "تمام يسطا نكمل؟ 😊"

## قواعد الذكاء في البيع:
- افهم احتياج العميل الحقيقي قبل ما تعرض أي حاجة.
- لو العميل سأل عن مواصفات أو تفاصيل — اجاوبه بدقة من البيانات اللي عندك.
- لو العميل مهتم، وجّهه للخطوة الجاية بشكل طبيعي بدون ضغط.
- لو السؤال مش في الـ FAQs ومش متعلق بالمنتجات، قول بأدب: "هسألهملك وأرد عليك في أقرب وقت."
- لو العميل ذكر اسمه، استخدمه في الرد عشان يحس بالاهتمام.
- ردك يكون دايماً على آخر رسالة من العميل — مش تعيد كلام قالوه قبل كده.

## قواعد صارمة:
- استخدم الأسعار من قائمة المنتجات فقط — لا تخترع أسعار.
- لا تعرض منتجات مش في القائمة.
- لا تقول "كمساعد ذكاء اصطناعي" أو أي كلام يكشف إنك بوت.
- لا تكرر التحية أو "وعليكم السلام" أكتر من مرة في المحادثة.
- لا تستخدم كلمات عامية غير محترمة.

## المنتجات المتاحة — استخدم هذه البيانات فقط ولا تخترع أسعار أو مواصفات:
${productsText}

## الأسئلة الشائعة — أجب منها مباشرة عند الحاجة:
${faqText}

## سجل المحادثة:
${historyText}

## ذاكرة سابقة ذات صلة:
${memoryText}

## تعليمات مهمة:
- إجاباتك على أسئلة المواصفات والتوصيل والخامة يجب أن تكون من الأسئلة الشائعة أعلاه حرفياً.
- لو السؤال موجود في الأسئلة الشائعة، استخدم الجواب المكتوب بالضبط.
- لو السؤال عن سعر أو منتج، استخدم البيانات من قائمة المنتجات فقط.
`;
  }

  async ask(
    message: string,
    context: {
      tenantId: string;
      lang: ChatLang;
      products: ProductCard[];
      faqs: { q: string; a: string }[];
      history: { role: 'user' | 'assistant'; content: string }[];
      memory: { role: 'user' | 'assistant'; content: string }[];
    },
  ): Promise<string> {
    const anthropicKey =
      this.config.get<string>('anthropic.apiKey', { infer: true }) ?? '';
    const openaiKey = this.config.get<string>('openai.apiKey', {
      infer: true,
    });
    if (!String(anthropicKey ?? '').trim() && !String(openaiKey ?? '').trim()) {
      return TIMEOUT_FALLBACK_AR;
    }

    const timeoutMs = Math.max(
      500,
      Number(
        this.config.get<number>('anthropic.timeoutMs', { infer: true }) ??
          this.config.get<number>('openai.timeoutMs', { infer: true }) ??
          25000,
      ),
    );

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const system = this.promptTemplate({
        products: context.products,
        faqs: context.faqs,
        history: context.history,
        memory: context.memory,
      });

      const text = String(anthropicKey ?? '').trim()
        ? await this.askAnthropic({
            apiKey: String(anthropicKey).trim(),
            models: this.resolveAnthropicModels(),
            signal: controller.signal,
            system,
            message,
          })
        : await this.askOpenAI({
            apiKey: String(openaiKey ?? '').trim(),
            model:
              this.config.get<string>('openai.model', { infer: true }) ??
              'gpt-4o-mini',
            signal: controller.signal,
            system,
            message,
          });

      if (!text) return TIMEOUT_FALLBACK_AR;

      return text;
    } catch {
      return TIMEOUT_FALLBACK_AR;
    } finally {
      clearTimeout(t);
    }
  }

  private resolveAnthropicModels(): string[] {
    const raw =
      (this.config.get<string>('anthropic.model', { infer: true }) ?? '').trim();

    const fromEnv = raw
      ? raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    // Try env-provided model(s) first, then a few common stable identifiers.
    const fallbacks = [
      // Current (2026) Claude API model IDs / aliases
      'claude-haiku-4-5',
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-6',
      'claude-opus-4-7',
      // Still-available older aliases (may depend on account access)
      'claude-sonnet-4-5',
      'claude-opus-4-6',
    ];

    const out: string[] = [];
    for (const m of [...fromEnv, ...fallbacks]) {
      const v = String(m ?? '').trim();
      if (!v) continue;
      if (!out.includes(v)) out.push(v);
    }
    return out;
  }

  private async askAnthropic(input: {
    apiKey: string;
    models: string[];
    signal: AbortSignal;
    system: string;
    message: string;
  }): Promise<string> {
    const models = Array.isArray(input.models) ? input.models : [];
    const candidates = models.length > 0 ? models : this.resolveAnthropicModels();

    for (const model of candidates) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: input.signal,
        headers: {
          'x-api-key': input.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system: input.system,
          messages: [{ role: 'user', content: input.message }],
        }),
      });

      if (!res.ok) {
        try {
          const errText = await res.text();
          this.logger.warn(
            `Anthropic error (model=${model}): ${res.status} ${res.statusText} ${errText}`,
          );
        } catch {
          this.logger.warn(
            `Anthropic error (model=${model}): ${res.status} ${res.statusText}`,
          );
        }
        // If model is not found / unauthorized, try next model.
        continue;
      }

      const data = (await res.json()) as {
        content?: { type: string; text: string }[];
      };
      const text = String(data?.content?.[0]?.text ?? '').trim();
      if (text) return text;
    }

    return '';
  }

  private async askOpenAI(input: {
    apiKey: string;
    model: string;
    signal: AbortSignal;
    system: string;
    message: string;
  }): Promise<string> {
    if (!input.apiKey) return '';
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: input.signal,
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model || 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 350,
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.message },
        ],
      }),
    });

    if (!res.ok) {
      return '';
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return String(data?.choices?.[0]?.message?.content ?? '').trim();
  }
}

