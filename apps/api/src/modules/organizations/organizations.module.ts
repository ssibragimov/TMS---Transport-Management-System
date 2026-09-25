import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PERMISSIONS } from '@gsm/shared';

import { Audited } from '@/common/audit/audit.interceptor';
import { RequirePermissions } from '@/common/decorators';
import { PrismaService } from '@/common/prisma/prisma.service';
import { TenantStore } from '@/common/tenancy/tenant-context';

class CreateOrganizationDto {
  @ApiProperty({ example: 'TSHN' })
  @IsString()
  @MaxLength(16)
  @Matches(/^[A-Z0-9]{2,16}$/, {
    message: 'Код — 2–16 заглавных латинских букв или цифр',
  })
  code: string;

  @ApiProperty() @IsString() @MaxLength(160) nameRu: string;
  @ApiProperty() @IsString() @MaxLength(160) nameUz: string;
  @ApiProperty() @IsString() @MaxLength(160) nameEn: string;
}

class UpdateOrganizationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) nameRu?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) nameUz?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) nameEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Организации и число офисов в них. Офисы считаются в системном контексте:
   * суперадминистратор, работающий в одном офисе, обязан видеть общее число.
   */
  list() {
    // await внутри системного контекста: запрос Prisma выполняется лениво.
    return TenantStore.runAsSystem(
      async () =>
        await this.prisma.db.organization.findMany({
          where: { deletedAt: null },
          orderBy: { nameRu: 'asc' },
          select: {
            id: true,
            code: true,
            nameRu: true,
            nameUz: true,
            nameEn: true,
            isActive: true,
            createdAt: true,
            _count: { select: { offices: { where: { deletedAt: null } } } },
          },
        }),
    );
  }

  async create(dto: CreateOrganizationDto) {
    const existing = await this.prisma.db.organization.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException({
        code: 'organization.code_taken',
        message: `Организация с кодом ${dto.code} уже существует`,
      });
    }
    return this.prisma.db.organization.create({ data: dto });
  }

  async update(id: number, dto: UpdateOrganizationDto) {
    const organization = await this.prisma.db.organization.findFirst({
      where: { id, deletedAt: null },
    });
    if (!organization) {
      throw new NotFoundException({
        code: 'organization.not_found',
        message: 'Организация не найдена',
      });
    }
    // Код не меняется: на него ссылаются интеграции и отчёты.
    return this.prisma.db.organization.update({
      where: { id },
      data: {
        ...(dto.nameRu !== undefined && { nameRu: dto.nameRu }),
        ...(dto.nameUz !== undefined && { nameUz: dto.nameUz }),
        ...(dto.nameEn !== undefined && { nameEn: dto.nameEn }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }
}

@ApiTags('organizations')
@Audited('Organization')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  @ApiOperation({ summary: 'Организации платформы' })
  list() {
    return this.organizations.list();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  @ApiOperation({ summary: 'Создание организации' })
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizations.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  @ApiOperation({ summary: 'Изменение организации' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrganizationDto) {
    return this.organizations.update(id, dto);
  }
}

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}
