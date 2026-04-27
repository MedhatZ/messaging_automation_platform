import {
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../database/prisma.service';

type JwtLikePayload = {
  sub?: string;
  userId?: string;
  email?: string;
  role?: string;
  tenantId?: string;
};

type AuthedSocket = Socket & {
  user?: {
    userId: string;
    tenantId: string;
    role?: string;
    email?: string;
  };
};

@WebSocketGateway({ namespace: 'conversations', cors: true })
export class ConversationGateway {
  private readonly logger = new Logger(ConversationGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: AuthedSocket): Promise<void> {
    try {
      const token = this.extractToken(client);
      const payload = this.verifyToken(token);
      const userId = (payload.sub ?? payload.userId ?? '').toString();
      const tenantId = (payload.tenantId ?? '').toString();
      if (!userId || !tenantId) {
        throw new UnauthorizedException('Invalid token payload');
      }

      client.user = {
        userId,
        tenantId,
        role: payload.role,
        email: payload.email,
      };
    } catch (e) {
      this.logger.warn(
        `Socket rejected: ${e instanceof Error ? e.message : String(e)}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket): void {
    // No-op; rooms are cleared automatically.
    void client;
  }

  @SubscribeMessage('join')
  async handleJoinConversation(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId?: string; agentName?: string },
  ): Promise<{ ok: true }> {
    this.assertAuthed(client);
    const conversationId = (body?.conversationId ?? '').toString();
    if (!conversationId) {
      throw new UnauthorizedException('conversationId is required');
    }

    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId: client.user!.tenantId },
      select: { id: true },
    });
    if (!conv) {
      throw new UnauthorizedException('Conversation not found');
    }

    await client.join(conversationId);
    const agentName = (body?.agentName ?? client.user!.email ?? 'agent').toString();
    this.emitAgentJoined(conversationId, agentName);
    return { ok: true };
  }

  @SubscribeMessage('leave')
  async handleLeaveConversation(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId?: string },
  ): Promise<{ ok: true }> {
    this.assertAuthed(client);
    const conversationId = (body?.conversationId ?? '').toString();
    if (conversationId) {
      await client.leave(conversationId);
    }
    return { ok: true };
  }

  @SubscribeMessage('typing_start')
  async handleTypingStart(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId?: string },
  ): Promise<{ ok: true }> {
    this.assertAuthed(client);
    const conversationId = (body?.conversationId ?? '').toString();
    if (!conversationId) return { ok: true };
    this.server.to(conversationId).emit('typing', {
      conversationId,
      status: 'start',
      at: new Date().toISOString(),
    });
    return { ok: true };
  }

  @SubscribeMessage('typing_stop')
  async handleTypingStop(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { conversationId?: string },
  ): Promise<{ ok: true }> {
    this.assertAuthed(client);
    const conversationId = (body?.conversationId ?? '').toString();
    if (!conversationId) return { ok: true };
    this.server.to(conversationId).emit('typing', {
      conversationId,
      status: 'stop',
      at: new Date().toISOString(),
    });
    return { ok: true };
  }

  emitNewMessage(conversationId: string, message: unknown): void {
    if (!this.server) return;
    this.server.to(conversationId).emit('new_message', {
      conversationId,
      message,
      at: new Date().toISOString(),
    });
  }

  emitConversationUpdated(conversationId: string, data: unknown): void {
    if (!this.server) return;
    this.server.to(conversationId).emit('conversation_updated', {
      conversationId,
      data,
      at: new Date().toISOString(),
    });
  }

  emitAgentJoined(conversationId: string, agentName: string): void {
    if (!this.server) return;
    this.server.to(conversationId).emit('agent_joined', {
      conversationId,
      agentName,
      at: new Date().toISOString(),
    });
  }

  private extractToken(client: Socket): string {
    const authToken = (client.handshake as any)?.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }
    const header = client.handshake.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }
    throw new UnauthorizedException('Missing auth token');
  }

  private verifyToken(token: string): JwtLikePayload {
    try {
      return this.jwt.verify<JwtLikePayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid auth token');
    }
  }

  private assertAuthed(client: AuthedSocket): void {
    if (!client.user?.tenantId) {
      throw new UnauthorizedException('Unauthenticated socket');
    }
  }
}

