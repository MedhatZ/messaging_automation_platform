import type { ChatLang } from '../../common/detect-message-language';

export type IncomingMessageContext = {
  tenantId: string;
  phone: string;
  name?: string;
  lang: ChatLang;
};

export type ProductCard = {
  id: string;
  name: string;
  price: number;
  imageUrl?: string;
};

export type DecisionResult =
  | { branch: 'faq'; reply: string }
  | { branch: 'product'; reply: string; products?: ProductCard[] }
  | { branch: 'order'; reply: string }
  | { branch: 'ai'; reply: string; products?: ProductCard[] };

