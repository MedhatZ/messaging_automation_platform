import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateWhatsappAccountDto {
  @IsUUID()
  tenantId: string;

  /** Meta "Phone number ID" from WhatsApp → API Setup. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  metaPhoneNumberId: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  metaWabaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  displayPhoneNumber?: string;

  /** Long-lived or system user token (stored encrypted). */
  @IsString()
  @IsNotEmpty()
  accessToken: string;

  /** Optional per-account verify token (GET webhook); otherwise use DEFAULT_VERIFY_TOKEN. */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  verifyToken?: string;
}
