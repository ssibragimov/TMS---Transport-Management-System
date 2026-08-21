import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { PaginationDto } from '@/common/dto/pagination.dto';

// ─── Приём точек ────────────────────────────────────────────────────────────

export class IngestPointDto {
  @ApiProperty({ description: 'IMEI трекера — по нему определяется машина' })
  @IsString()
  @MaxLength(24)
  imei: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  ts: string;

  @ApiProperty()
  @IsLatitude()
  lat: number;

  @ApiProperty()
  @IsLongitude()
  lon: number;

  @ApiPropertyOptional({ description: 'км/ч' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(400)
  speed?: number;

  @ApiPropertyOptional({ description: 'Курс, градусы' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(359)
  heading?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(-500)
  @Max(15000)
  altitude?: number;

  @ApiPropertyOptional({ description: 'Число видимых спутников' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(64)
  satellites?: number;

  @ApiPropertyOptional({ description: 'Зажигание' })
  @IsOptional()
  @IsBoolean()
  ignition?: boolean;

  @ApiPropertyOptional({ description: 'Одометр трекера, км' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  odometer?: number;

  @ApiPropertyOptional({ description: 'Моточасы трекера' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  engineHours?: number;
}

export class IngestDto {
  /**
   * Потолок пачки: трекер после суток офлайна выгружает накопленное разом,
   * но пакет на десятки тысяч точек означал бы минуты в одной транзакции.
   * Шлюз обязан разбивать выгрузку на части.
   */
  @ApiProperty({ type: [IngestPointDto], maxItems: 1000 })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => IngestPointDto)
  points: IngestPointDto[];
}

// ─── Трекеры ────────────────────────────────────────────────────────────────

export class CreateDeviceDto {
  @ApiProperty({ description: 'Уникален по всей системе' })
  @IsString()
  @Matches(/^[0-9]{10,24}$/, { message: 'IMEI — от 10 до 24 цифр' })
  imei: string;

  @ApiProperty()
  @IsInt()
  @IsPositive()
  vehicleId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  provider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(24)
  simNumber?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  installedAt?: string;
}

export class UpdateDeviceDto extends PartialType(CreateDeviceDto) {
  @ApiPropertyOptional({ format: 'date', description: 'Дата снятия трекера' })
  @IsOptional()
  @IsDateString()
  removedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─── Геозоны ────────────────────────────────────────────────────────────────

export class GeofenceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(160)
  name: string;

  @ApiProperty({ description: 'APRON | PARKING | FUEL_DEPOT | PERIMETER | OTHER' })
  @IsString()
  @MaxLength(32)
  kind: string;

  @ApiPropertyOptional({
    description: 'Кольцо [[lon, lat], …], минимум три точки',
    type: 'array',
    items: { type: 'array', items: { type: 'number' } },
  })
  @IsOptional()
  @IsArray()
  area?: number[][];

  @ApiPropertyOptional({ description: 'Ограничение скорости внутри зоны, км/ч' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  speedLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  alertOnEntry?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  alertOnExit?: boolean;

  @ApiPropertyOptional({ example: '#1677ff' })
  @IsOptional()
  @IsString()
  @MaxLength(9)
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateGeofenceDto extends PartialType(GeofenceDto) {}

// ─── Запросы ────────────────────────────────────────────────────────────────

export class TrackQueryDto {
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  from: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  to: string;

  @ApiPropertyOptional({ default: 5000, maximum: 50000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(50000)
  limit = 5000;
}

export class GeofenceEventQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  vehicleId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  geofenceId?: number;

  @ApiPropertyOptional({ enum: ['ENTRY', 'EXIT'] })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => String(value).toUpperCase())
  eventType?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
