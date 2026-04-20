import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class TestMatchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;
}
