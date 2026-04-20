import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { WhatsappTokenCryptoService } from '../channels/whatsapp/whatsapp-token-crypto.service';
import { PrismaService } from '../database/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { accessTokenLast4FromPlain } from '../whatsapp-accounts/access-token-preview.util';
import { CreateWhatsappAccountDto } from './dto/create-whatsapp-account.dto';

const SUBSCRIPTION_DAYS = 30;
const BCRYPT_ROUNDS = 10;

export type CreateTenantResult = {
  tenantId: string;
  userEmail: string;
  /** Plain password — returned once for the admin to share with the client. */
  password: string;
};

export type ResetClientPasswordResult = {
  success: true;
  email: string;
  /** Plain password — returned once for the admin to share with the client. */
  newPassword: string;
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappTokenCrypto: WhatsappTokenCryptoService,
  ) {}

  async createTenant(dto: CreateTenantDto): Promise<CreateTenantResult> {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const subscriptionEnd = this.addDays(new Date(), SUBSCRIPTION_DAYS);

    let tenant: { id: string };
    try {
      tenant = await this.prisma.$transaction(async (tx) => {
        const created = await tx.tenant.create({
          data: {
            name: dto.name.trim(),
            email,
            subscriptionEnd,
          },
          select: { id: true },
        });
        await tx.user.create({
          data: {
            email,
            password: passwordHash,
            role: UserRole.CLIENT,
            tenantId: created.id,
          },
        });
        return created;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Email is already registered');
      }
      throw e;
    }

    return {
      tenantId: tenant.id,
      userEmail: email,
      password: dto.password,
    };
  }

  async resetClientPassword(
    userId: string,
    newPassword: string,
  ): Promise<ResetClientPasswordResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role !== UserRole.CLIENT) {
      throw new ForbiddenException('Only client passwords can be reset here');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash },
    });

    return {
      success: true,
      email: user.email,
      newPassword,
    };
  }

  async listTenants() {
    const rows = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        subscriptionEnd: true,
        users: {
          where: { role: UserRole.CLIENT },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { id: true },
        },
      },
    });
    return rows.map(({ users, ...tenant }) => ({
      ...tenant,
      userId: users[0]?.id ?? null,
    }));
  }

  async toggleTenantActive(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return this.prisma.tenant.update({
      where: { id },
      data: { isActive: !tenant.isActive },
      select: { id: true, isActive: true },
    });
  }

  async createWhatsappAccount(dto: CreateWhatsappAccountDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const plain = dto.accessToken.trim();
    const accessTokenEncrypted = this.whatsappTokenCrypto.encrypt(plain);
    const accessTokenLast4 = accessTokenLast4FromPlain(plain);

    try {
      return await this.prisma.whatsappAccount.create({
        data: {
          tenantId: dto.tenantId,
          metaPhoneNumberId: dto.metaPhoneNumberId.trim(),
          metaWabaId: dto.metaWabaId?.trim() || null,
          displayPhoneNumber: dto.displayPhoneNumber?.trim() || null,
          accessTokenEncrypted,
          accessTokenLast4,
          verifyToken: dto.verifyToken?.trim() || null,
          status: 'active',
        },
        select: {
          id: true,
          tenantId: true,
          metaPhoneNumberId: true,
          metaWabaId: true,
          displayPhoneNumber: true,
          accessTokenLast4: true,
          status: true,
        },
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

  async extendSubscription(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: { id: true, subscriptionEnd: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const now = new Date();
    const end = tenant.subscriptionEnd;
    const expired = !end || end.getTime() <= now.getTime();
    const base = expired ? now : end;
    const subscriptionEnd = this.addDays(base, SUBSCRIPTION_DAYS);
    return this.prisma.tenant.update({
      where: { id },
      data: { subscriptionEnd },
      select: { id: true, subscriptionEnd: true },
    });
  }

  private addDays(from: Date, days: number): Date {
    const d = new Date(from.getTime());
    d.setDate(d.getDate() + days);
    return d;
  }
}
