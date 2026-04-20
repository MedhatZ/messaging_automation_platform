import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { WHATSAPP_GRAPH_API_VERSION } from '../channels/whatsapp/whatsapp-graph.constants';
import { WhatsappTokenCryptoService } from '../channels/whatsapp/whatsapp-token-crypto.service';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../database/prisma.service';
import { whatsappPhoneCacheKey } from '../channels/whatsapp/whatsapp-account-cache';
import {
  accessTokenLast4FromPlain,
} from './access-token-preview.util';
import { CreateTenantWhatsappAccountDto } from './dto/create-tenant-whatsapp-account.dto';
import { UpdateTenantWhatsappAccountDto } from './dto/update-tenant-whatsapp-account.dto';

const publicSelect = {
  id: true,
  tenantId: true,
  metaPhoneNumberId: true,
  metaWabaId: true,
  displayPhoneNumber: true,
  accessTokenLast4: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const TEST_MESSAGE = 'Hello from system';

@Injectable()
export class WhatsappAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenCrypto: WhatsappTokenCryptoService,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
  ) {}

  listForTenant(tenantId: string) {
    return this.prisma.whatsappAccount.findMany({
      where: { tenantId },
      select: publicSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createForTenant(
    tenantId: string,
    dto: CreateTenantWhatsappAccountDto,
  ) {
    const plain = dto.accessToken.trim();
    const accessTokenEncrypted = this.tokenCrypto.encrypt(plain);
    const accessTokenLast4 = accessTokenLast4FromPlain(plain);

    try {
      return await this.prisma.whatsappAccount.create({
        data: {
          tenantId,
          metaPhoneNumberId: dto.metaPhoneNumberId.trim(),
          metaWabaId: dto.metaWabaId?.trim() || null,
          displayPhoneNumber: dto.displayPhoneNumber?.trim() || null,
          accessTokenEncrypted,
          accessTokenLast4,
          verifyToken: dto.verifyToken?.trim() || null,
          status: 'active',
        },
        select: publicSelect,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'A WhatsApp account with this metaPhoneNumberId already exists',
        );
      }
      throw e;
    }
  }

  async updateForTenant(
    tenantId: string,
    id: string,
    dto: UpdateTenantWhatsappAccountDto,
  ) {
    const existing = await this.prisma.whatsappAccount.findFirst({
      where: { id, tenantId },
      select: { id: true, metaPhoneNumberId: true },
    });
    if (!existing) {
      throw new NotFoundException('WhatsApp account not found');
    }

    const hasPatch =
      dto.metaPhoneNumberId !== undefined ||
      dto.metaWabaId !== undefined ||
      dto.displayPhoneNumber !== undefined ||
      dto.status !== undefined ||
      (dto.accessToken !== undefined && dto.accessToken.trim() !== '');
    if (!hasPatch) {
      throw new BadRequestException('No fields to update');
    }

    if (
      dto.metaPhoneNumberId !== undefined &&
      !dto.metaPhoneNumberId.trim()
    ) {
      throw new BadRequestException('metaPhoneNumberId cannot be empty');
    }

    const data: Prisma.WhatsappAccountUpdateInput = {};

    if (dto.metaPhoneNumberId !== undefined) {
      data.metaPhoneNumberId = dto.metaPhoneNumberId.trim();
    }
    if (dto.metaWabaId !== undefined) {
      data.metaWabaId = dto.metaWabaId.trim() || null;
    }
    if (dto.displayPhoneNumber !== undefined) {
      data.displayPhoneNumber = dto.displayPhoneNumber.trim() || null;
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
    }
    if (dto.accessToken !== undefined && dto.accessToken.trim() !== '') {
      const plain = dto.accessToken.trim();
      data.accessTokenEncrypted = this.tokenCrypto.encrypt(plain);
      data.accessTokenLast4 = accessTokenLast4FromPlain(plain);
    }

    try {
      const updated = await this.prisma.whatsappAccount.update({
        where: { id },
        data,
        select: publicSelect,
      });

      await this.cache.del(whatsappPhoneCacheKey(existing.metaPhoneNumberId));
      if (updated.metaPhoneNumberId !== existing.metaPhoneNumberId) {
        await this.cache.del(
          whatsappPhoneCacheKey(updated.metaPhoneNumberId),
        );
      }

      return updated;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          'A WhatsApp account with this metaPhoneNumberId already exists',
        );
      }
      throw e;
    }
  }

  async removeForTenant(tenantId: string, id: string) {
    const existing = await this.prisma.whatsappAccount.findFirst({
      where: { id, tenantId },
      select: { id: true, metaPhoneNumberId: true },
    });
    if (!existing) {
      throw new NotFoundException('WhatsApp account not found');
    }

    await this.prisma.whatsappAccount.delete({ where: { id } });
    await this.cache.del(whatsappPhoneCacheKey(existing.metaPhoneNumberId));
    return { ok: true as const };
  }

  async testConnection(
    tenantId: string,
    accountId: string,
  ): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
    const to = (this.config.get<string>('whatsapp.testTo', { infer: true }) ?? '')
      .trim()
      .replace(/\s/g, '');
    if (!to) {
      return { ok: false, error: 'WHATSAPP_TEST_TO is not configured' };
    }
    const account = await this.prisma.whatsappAccount.findFirst({
      where: { id: accountId, tenantId },
      select: {
        id: true,
        metaPhoneNumberId: true,
        accessTokenEncrypted: true,
        status: true,
      },
    });
    if (!account) {
      return { ok: false, error: 'WhatsApp account not found' };
    }
    if (account.status !== 'active') {
      return { ok: false, error: 'Account is not active' };
    }

    let token: string;
    try {
      token = this.tokenCrypto.decrypt(account.accessTokenEncrypted);
    } catch {
      return { ok: false, error: 'Failed to decrypt access token' };
    }

    const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${account.metaPhoneNumberId}/messages`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: TEST_MESSAGE },
        }),
      });
      const text = await res.text();
      if (res.ok) {
        return { ok: true };
      }
      return {
        ok: false,
        status: res.status,
        error: text.length > 400 ? `${text.slice(0, 400)}…` : text,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
