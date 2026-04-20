import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetClientPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @MaxLength(128)
  newPassword: string;
}
