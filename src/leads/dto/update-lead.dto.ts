import { LeadStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateLeadDto {
  @IsEnum(LeadStatus)
  status: LeadStatus;
}
