import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTenantWhatsappAccountDto {
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

  @IsString()
  @IsNotEmpty()
  accessToken: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  verifyToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  metaAppSecret?: string;
}
