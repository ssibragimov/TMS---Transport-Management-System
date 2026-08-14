import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'dispatcher.tas@gsm.local' })
  @IsEmail({}, { message: 'Некорректный адрес электронной почты' })
  @MaxLength(190)
  email: string;

  @ApiProperty({ example: 'Admin123!' })
  @IsString()
  @MinLength(8, { message: 'Пароль короче 8 символов' })
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({
    description:
      'Офис, в котором начинается сессия. Если не указан — офис по умолчанию из профиля.',
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  officeId?: number;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1024)
  refreshToken: string;
}

export class SwitchOfficeDto {
  @ApiProperty({ description: 'Офис, в который переключается пользователь' })
  @IsInt()
  @IsPositive()
  officeId: number;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Новый пароль короче 8 символов' })
  @MaxLength(128)
  newPassword: string;
}
