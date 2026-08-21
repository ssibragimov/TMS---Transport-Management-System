import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { PaginationDto } from '@/common/dto/pagination.dto';

/**
 * Назначение в офис. Роли выдаются в разрезе офиса: один и тот же человек
 * может быть диспетчером в Ташкенте и наблюдателем в Самарканде, и объединять
 * эти наборы в один список ролей нельзя — права разойдутся при переключении.
 */
export class OfficeAssignmentDto {
  @ApiProperty()
  @IsInt()
  @IsPositive()
  officeId: number;

  @ApiProperty({ type: [String], description: 'Коды ролей в этом офисе' })
  @IsArray()
  @IsString({ each: true })
  roleCodes: string[];
}

export class CreateUserDto {
  @ApiProperty()
  @IsEmail({}, { message: 'Некорректный адрес электронной почты' })
  @MaxLength(190)
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Пароль короче 8 символов' })
  @MaxLength(128)
  password: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  fullName: string;

  @ApiPropertyOptional({
    description:
      'Служебный внутренний номер телефона: ровно четыре цифры. ' +
      'Не уникален — один аппарат может быть закреплён за несколькими сотрудниками.',
    example: '1042',
  })
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'Внутренний номер — ровно четыре цифры' })
  internalNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ enum: ['ru', 'uz', 'en'], default: 'ru' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;

  @ApiProperty({
    type: [OfficeAssignmentDto],
    description: 'Офисы и роли в каждом из них. Минимум один.',
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Назначьте хотя бы один офис' })
  @ValidateNested({ each: true })
  @Type(() => OfficeAssignmentDto)
  offices: OfficeAssignmentDto[];

  @ApiPropertyOptional({
    description: 'Офис, в который пользователь попадает после входа. По умолчанию — первый из списка.',
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  defaultOfficeId?: number;

  @ApiPropertyOptional({ enum: UserStatus, default: UserStatus.ACTIVE })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Служебный внутренний номер: четыре цифры. Пустая строка снимает номер.',
  })
  @IsOptional()
  @Matches(/^(\d{4})?$/, { message: 'Внутренний номер — ровно четыре цифры' })
  internalNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ type: [OfficeAssignmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OfficeAssignmentDto)
  offices?: OfficeAssignmentDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @IsPositive()
  defaultOfficeId?: number;
}

export class ResetPasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Пароль короче 8 символов' })
  @MaxLength(128)
  password: string;
}

export class UserQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({
    description:
      'Показывать пользователей всех доступных офисов, а не только активного. ' +
      'Имеет смысл для головного офиса.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allOffices?: boolean;
}

export class RoleDto {
  @ApiProperty({ description: 'Машинный код, латиница и подчёркивания' })
  @IsString()
  @MaxLength(48)
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'Код роли — заглавные латинские буквы, цифры и подчёркивание',
  })
  code: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ type: [String], description: 'Коды прав' })
  @IsArray()
  @IsString({ each: true })
  permissions: string[];
}

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];
}
