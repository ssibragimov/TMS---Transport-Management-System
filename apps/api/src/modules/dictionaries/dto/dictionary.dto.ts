import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { MeterType, VehicleCategory } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class FuelTypeDto {
  @ApiProperty({ example: 'DT' })
  @IsString()
  @MaxLength(24)
  @Matches(/^[A-Z0-9-]+$/, { message: 'Код — заглавные латинские буквы, цифры и дефис' })
  code: string;

  @ApiProperty({ example: 'Дизельное топливо' })
  @IsString()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({
    description: 'Плотность кг/л при +20 °C. Нужна для перевода литров в тонны.',
    default: 0.75,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.3)
  @Max(1.5)
  density?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateFuelTypeDto extends PartialType(FuelTypeDto) {}

export class VehicleModelDto {
  @ApiProperty({ enum: VehicleCategory })
  @IsEnum(VehicleCategory)
  category: VehicleCategory;

  @ApiProperty({ example: 'COBUS' })
  @IsString()
  @MaxLength(120)
  manufacturer: string;

  @ApiProperty({ example: '3000' })
  @IsString()
  @MaxLength(120)
  model: string;

  @ApiPropertyOptional({ enum: MeterType, default: MeterType.ODOMETER })
  @IsOptional()
  @IsEnum(MeterType)
  meterType?: MeterType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @IsPositive()
  fuelTypeId?: number;

  @ApiPropertyOptional({ description: 'Ёмкость бака, л' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000)
  tankCapacity?: number;

  @ApiPropertyOptional({ description: 'Полная масса, кг' })
  @IsOptional()
  @IsInt()
  @Min(0)
  grossWeight?: number;

  @ApiPropertyOptional({ description: 'Число мест — для автобусов' })
  @IsOptional()
  @IsInt()
  @Min(0)
  seats?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateVehicleModelDto extends PartialType(VehicleModelDto) {}

export class DepartmentDto {
  @ApiProperty({ example: 'SST' })
  @IsString()
  @MaxLength(24)
  code: string;

  @ApiProperty({ example: 'Служба спецтранспорта' })
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDepartmentDto extends PartialType(DepartmentDto) {}

export class CounterpartyDto {
  @ApiProperty()
  @IsString()
  @MaxLength(240)
  name: string;

  @ApiPropertyOptional({ description: 'ИНН' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  inn?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFuelSupplier?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isServiceProvider?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCounterpartyDto extends PartialType(CounterpartyDto) {}

export class SparePartDto {
  @ApiProperty({ example: 'FLT-OIL-01' })
  @IsString()
  @MaxLength(48)
  code: string;

  @ApiProperty({ example: 'Фильтр масляный' })
  @IsString()
  @MaxLength(240)
  name: string;

  @ApiPropertyOptional({ default: 'шт' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  unit?: string;

  @ApiPropertyOptional({ description: 'Каталожный номер производителя' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  catalogNumber?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSparePartDto extends PartialType(SparePartDto) {}
