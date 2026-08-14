import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { OfficeKind } from '@prisma/client';
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
import { PERMISSIONS } from '@gsm/shared';

import { Audited } from '@/common/audit/audit.interceptor';
import { RequirePermissions } from '@/common/decorators';
import { PrismaService } from '@/common/prisma/prisma.service';

class CreateOfficeDto {
  @ApiProperty({ example: 'JIZ', description: 'Код участвует в номерах документов' })
  @IsString()
  @MaxLength(8)
  @Matches(/^[A-Z]{2,8}$/, { message: 'Код — 2–8 заглавных латинских букв' })
  code: string;

  @ApiProperty({ enum: OfficeKind, default: OfficeKind.AIRPORT })
  @IsEnum(OfficeKind)
  kind: OfficeKind;

  @ApiPropertyOptional({ description: 'Головной офис, если это аэропорт' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  parentId?: number;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  nameRu: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  nameUz: string;

  @ApiProperty()
  @IsString()
  @MaxLength(160)
  nameEn: string;

  @ApiPropertyOptional({ example: 'JIZ' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  iataCode?: string;

  @ApiPropertyOptional({ example: 'UTSJ' })
  @IsOptional()
  @IsString()
  @MaxLength(4)
  icaoCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ default: 'Asia/Tashkent' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Зимняя надбавка к норме расхода, %. У каждого региона своя.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  winterSurchargePct?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 12, default: 11 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  winterFromMonth?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 12, default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  winterToMonth?: number;
}

class UpdateOfficeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) nameRu?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) nameUz?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) nameEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3) iataCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4) icaoCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(400) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  winterSurchargePct?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(12) winterFromMonth?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(12) winterToMonth?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

@Injectable()
export class OfficesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Список офисов возвращается уже отфильтрованным политикой RLS:
   * сотрудник Бухары увидит здесь только Бухару, сотрудник головного
   * офиса — все аэропорты страны. Дополнительного WHERE не требуется.
   */
  list() {
    return this.prisma.db.office.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ kind: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        kind: true,
        nameRu: true,
        nameUz: true,
        nameEn: true,
        iataCode: true,
        icaoCode: true,
        city: true,
        timezone: true,
        parentId: true,
      },
    });
  }

  findOne(id: number) {
    return this.prisma.db.office.findFirstOrThrow({
      where: { id, deletedAt: null },
      include: {
        departments: { where: { deletedAt: null, isActive: true } },
        _count: { select: { vehicles: true, drivers: true, fuelTanks: true } },
      },
    });
  }

  /** Сводка по офису для стартового экрана. */
  async summary(id: number) {
    const [vehicles, activeVehicles, drivers, openWaybills, tanks] = await Promise.all([
      this.prisma.db.vehicle.count({ where: { officeId: id, deletedAt: null } }),
      this.prisma.db.vehicle.count({
        where: { officeId: id, deletedAt: null, status: 'ACTIVE' },
      }),
      this.prisma.db.driver.count({ where: { officeId: id, deletedAt: null, isActive: true } }),
      this.prisma.db.waybill.count({
        where: {
          officeId: id,
          deletedAt: null,
          status: { in: ['ISSUED', 'IN_PROGRESS', 'SUBMITTED'] },
        },
      }),
      this.prisma.db.fuelTank.findMany({
        where: { officeId: id, deletedAt: null, isActive: true },
        select: { id: true, code: true, name: true, capacity: true, currentVolume: true },
      }),
    ]);

    return {
      vehicles: { total: vehicles, active: activeVehicles },
      drivers,
      openWaybills,
      tanks,
    };
  }

  /**
   * Подключение нового аэропорта.
   *
   * Выполняется в системном контексте: офиса ещё нет ни в чьей области
   * видимости, и политика RLS отвергла бы вставку с WITH CHECK.
   * Право office.manage есть только у суперадминистратора.
   */
  async create(dto: CreateOfficeDto) {
    return this.prisma.systemTransaction(async (tx) => {
      const existing = await tx.office.findUnique({ where: { code: dto.code } });
      if (existing) {
        throw new ConflictException({
          code: 'office.code_taken',
          message: `Офис с кодом ${dto.code} уже существует`,
        });
      }

      return tx.office.create({
        data: {
          code: dto.code,
          kind: dto.kind,
          parentId: dto.parentId ?? null,
          nameRu: dto.nameRu,
          nameUz: dto.nameUz,
          nameEn: dto.nameEn,
          iataCode: dto.iataCode ?? null,
          icaoCode: dto.icaoCode ?? null,
          city: dto.city ?? null,
          address: dto.address ?? null,
          phone: dto.phone ?? null,
          timezone: dto.timezone ?? 'Asia/Tashkent',
          winterSurchargePct: dto.winterSurchargePct ?? 0,
          winterFromMonth: dto.winterFromMonth ?? 11,
          winterToMonth: dto.winterToMonth ?? 3,
        },
      });
    });
  }

  async update(id: number, dto: UpdateOfficeDto) {
    return this.prisma.systemTransaction(async (tx) => {
      const office = await tx.office.findFirst({ where: { id, deletedAt: null } });
      if (!office) {
        throw new ConflictException({
          code: 'office.not_found',
          message: 'Офис не найден',
        });
      }

      return tx.office.update({
        where: { id },
        data: {
          ...(dto.nameRu !== undefined && { nameRu: dto.nameRu }),
          ...(dto.nameUz !== undefined && { nameUz: dto.nameUz }),
          ...(dto.nameEn !== undefined && { nameEn: dto.nameEn }),
          ...(dto.iataCode !== undefined && { iataCode: dto.iataCode }),
          ...(dto.icaoCode !== undefined && { icaoCode: dto.icaoCode }),
          ...(dto.city !== undefined && { city: dto.city }),
          ...(dto.address !== undefined && { address: dto.address }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.timezone !== undefined && { timezone: dto.timezone }),
          ...(dto.winterSurchargePct !== undefined && {
            winterSurchargePct: dto.winterSurchargePct,
          }),
          ...(dto.winterFromMonth !== undefined && { winterFromMonth: dto.winterFromMonth }),
          ...(dto.winterToMonth !== undefined && { winterToMonth: dto.winterToMonth }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          // Код офиса не меняется: он вшит в номера уже выданных документов.
        },
      });
    });
  }
}

@ApiTags('offices')
@Audited('Office')
@Controller('offices')
export class OfficesController {
  constructor(private readonly offices: OfficesService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.OFFICE_MANAGE)
  @ApiOperation({
    summary: 'Подключение нового аэропорта',
    description:
      'Код офиса участвует в номерах документов и после создания не меняется. ' +
      'Зимняя надбавка задаётся здесь и применяется ко всей технике офиса.',
  })
  create(@Body() dto: CreateOfficeDto) {
    return this.offices.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.OFFICE_MANAGE)
  @ApiOperation({ summary: 'Изменение офиса' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOfficeDto) {
    return this.offices.update(id, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.OFFICE_READ)
  @ApiOperation({ summary: 'Офисы, доступные текущему пользователю' })
  list() {
    return this.offices.list();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.OFFICE_READ)
  @ApiOperation({ summary: 'Карточка офиса' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.offices.findOne(id);
  }

  @Get(':id/summary')
  @RequirePermissions(PERMISSIONS.OFFICE_READ)
  @ApiOperation({ summary: 'Сводка для главного экрана' })
  summary(@Param('id', ParseIntPipe) id: number) {
    return this.offices.summary(id);
  }
}

@Module({
  controllers: [OfficesController],
  providers: [OfficesService],
  exports: [OfficesService],
})
export class OfficesModule {}
