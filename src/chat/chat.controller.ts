import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { detectMessageLanguage } from '../common/detect-message-language';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../auth/jwt-access-payload.interface';
import { ClientTenantGuard } from '../auth/guards/client-tenant.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatEngineService } from './chat-engine.service';
import { ChatService } from './chat.service';
import { ProcessMessageDto } from './dto/process-message.dto';
import { TestMatchDto } from './dto/test-match.dto';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatEngine: ChatEngineService,
    private readonly chatService: ChatService,
  ) {}

  @Post('process')
  @UseGuards(JwtAuthGuard, ClientTenantGuard)
  process(
    @Body() dto: ProcessMessageDto,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    return this.chatService.processMessage({
      tenantId: user.tenantId,
      channelType: dto.channelType,
      externalUserId: dto.externalUserId,
      externalUserName: dto.externalUserName,
      message: dto.message,
    });
  }

  @Post('test-match')
  @UseGuards(JwtAuthGuard, ClientTenantGuard)
  testMatch(
    @Body() dto: TestMatchDto,
    @CurrentUser() user: JwtAccessPayload,
  ) {
    const lang = detectMessageLanguage(dto.message);
    return this.chatEngine.matchMessage({
      tenantId: user.tenantId,
      message: dto.message,
      lang,
    });
  }
}
