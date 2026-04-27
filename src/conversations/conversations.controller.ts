import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../auth/jwt-access-payload.interface';
import { ClientTenantGuard } from '../auth/guards/client-tenant.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationMemoryService } from '../chat/services/conversation-memory.service';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
@UseGuards(JwtAuthGuard, ClientTenantGuard)
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly memory: ConversationMemoryService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: JwtAccessPayload) {
    return this.conversationsService.findAllForTenant(user.tenantId);
  }

  @Get('stats')
  getStats(@CurrentUser() user: JwtAccessPayload) {
    return this.conversationsService.getStats(user.tenantId);
  }

  @Get(':id/messages')
  findMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.conversationsService.findMessagesForConversation(
      id,
      user.tenantId,
    );
  }

  @Get(':id/memory-stats')
  memoryStats(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.memory.getMemoryStats({
      tenantId: user.tenantId,
      conversationId: id,
    });
  }

  @Get(':id/memory/search')
  memorySearch(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('q') q: string | undefined,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    const query = typeof q === 'string' ? q.trim() : '';
    if (!query) {
      throw new BadRequestException('Query parameter "q" is required');
    }
    return this.memory.searchMemories({
      tenantId: user.tenantId,
      conversationId: id,
      query,
      take: 10,
    });
  }

  @Delete(':id/memory')
  clearMemory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.memory.clearConversationMemory({
      tenantId: user.tenantId,
      conversationId: id,
    });
  }
}
