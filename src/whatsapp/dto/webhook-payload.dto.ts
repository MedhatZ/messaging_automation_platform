import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class WhatsappWebhookMetadataDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phone_number_id?: string;
}

class WhatsappWebhookChangeValueDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => WhatsappWebhookMetadataDto)
  metadata?: WhatsappWebhookMetadataDto;
}

class WhatsappWebhookChangeDto {
  @IsOptional()
  @IsString()
  field?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => WhatsappWebhookChangeValueDto)
  value?: WhatsappWebhookChangeValueDto;
}

class WhatsappWebhookEntryDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WhatsappWebhookChangeDto)
  changes?: WhatsappWebhookChangeDto[];
}

export class WhatsappWebhookPayloadDto {
  @IsOptional()
  @IsString()
  object?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WhatsappWebhookEntryDto)
  entry!: WhatsappWebhookEntryDto[];
}

