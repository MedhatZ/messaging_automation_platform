import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FaqController } from './faq.controller';
import { FaqService } from './faq.service';

@Module({
  imports: [AuthModule],
  controllers: [FaqController],
  providers: [FaqService],
})
export class FaqModule {}
