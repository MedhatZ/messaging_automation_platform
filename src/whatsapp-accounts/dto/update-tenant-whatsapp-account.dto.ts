import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTenantWhatsappAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  metaPhoneNumberId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  metaWabaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  displayPhoneNumber?: string;

  /** If provided, replaces the stored token (encrypted at rest). */
  @IsOptional()
  @IsString()
  @MaxLength(8192)
  accessToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  verifyToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  metaAppSecret?: string;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'disabled'])
  status?: string;
}
