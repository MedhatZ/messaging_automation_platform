import { ChannelType } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ProcessMessageDto {
  @IsEnum(ChannelType)
  channelType: ChannelType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  externalUserId: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  externalUserName?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;
}
