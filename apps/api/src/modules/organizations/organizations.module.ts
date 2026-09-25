import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { AuditAction, WaybillTaskLayout } from '@prisma/client';
import type { Response } from 'express';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PERMISSIONS } from '@gsm/shared';

import { AuditAs, Audited } from '@/common/audit/audit.interceptor';
import { RequirePermissions } from '@/common/decorators';
import { PrismaService } from '@/common/prisma/prisma.service';
import { StorageService } from '@/common/storage/storage.service';
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

  @ApiPropertyOptional({ enum: WaybillTaskLayout, default: WaybillTaskLayout.FLIGHT })
  @IsOptional()
  @IsEnum(WaybillTaskLayout)
  taskLayout?: WaybillTaskLayout;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() taskAddressALocations?: boolean;
}

class UpdateOrganizationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) nameRu?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) nameUz?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(160) nameEn?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;

  @ApiPropertyOptional({ enum: WaybillTaskLayout })
  @IsOptional()
  @IsEnum(WaybillTaskLayout)
  taskLayout?: WaybillTaskLayout;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() taskAddressALocations?: boolean;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

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
            taskLayout: true,
            taskAddressALocations: true,
            logoKey: true,
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
    await this.findOrFail(id);
    // Код не меняется: на него ссылаются интеграции и отчёты.
    return this.prisma.db.organization.update({
      where: { id },
      data: {
        ...(dto.nameRu !== undefined && { nameRu: dto.nameRu }),
        ...(dto.nameUz !== undefined && { nameUz: dto.nameUz }),
        ...(dto.nameEn !== undefined && { nameEn: dto.nameEn }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.taskLayout !== undefined && { taskLayout: dto.taskLayout }),
        ...(dto.taskAddressALocations !== undefined && {
          taskAddressALocations: dto.taskAddressALocations,
        }),
      },
    });
  }

  // ─── Логотип ──────────────────────────────────────────────────────────────
  // Общий для всех офисов организации, у которых нет собственного логотипа.

  async setLogo(id: number, file: Express.Multer.File) {
    const organization = await this.findOrFail(id);
    const stored = await this.storage.saveImage(`organizations/${id}`, file);

    const updated = await this.prisma.db.organization.update({
      where: { id },
      data: { logoKey: stored.key, logoMimeType: stored.mimeType },
      select: { id: true, code: true, logoKey: true },
    });

    // Старый файл удаляется только после успешной записи в БД.
    if (organization.logoKey) await this.storage.remove(organization.logoKey);
    return updated;
  }

  async readLogo(id: number) {
    const organization = await this.findOrFail(id);
    if (!organization.logoKey) {
      throw new NotFoundException({
        code: 'organization.logo_not_found',
        message: 'У организации нет логотипа',
      });
    }
    const { stream } = this.storage.createReadStream(organization.logoKey);
    return { stream, mimeType: organization.logoMimeType ?? 'image/png' };
  }

  async removeLogo(id: number) {
    const organization = await this.findOrFail(id);
    await this.prisma.db.organization.update({
      where: { id },
      data: { logoKey: null, logoMimeType: null },
    });
    if (organization.logoKey) await this.storage.remove(organization.logoKey);
    return { id, logoKey: null };
  }

  private async findOrFail(id: number) {
    const organization = await this.prisma.db.organization.findFirst({
      where: { id, deletedAt: null },
    });
    if (!organization) {
      throw new NotFoundException({
        code: 'organization.not_found',
        message: 'Организация не найдена',
      });
    }
    return organization;
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

  @Get(':id/logo')
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  @ApiOperation({ summary: 'Логотип организации' })
  async logo(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, mimeType } = await this.organizations.readLogo(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return new StreamableFile(stream);
  }

  @Post(':id/logo')
  @AuditAs(AuditAction.UPDATE)
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: StorageService.MAX_IMAGE_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Загрузка логотипа организации (JPEG, PNG, WebP, HEIC, до 10 МБ)',
  })
  uploadLogo(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'storage.file_required',
        message: 'Файл не передан',
      });
    }
    return this.organizations.setLogo(id, file);
  }

  @Delete(':id/logo')
  @AuditAs(AuditAction.UPDATE)
  @RequirePermissions(PERMISSIONS.PLATFORM_MANAGE)
  @ApiOperation({ summary: 'Удаление логотипа организации' })
  deleteLogo(@Param('id', ParseIntPipe) id: number) {
    return this.organizations.removeLogo(id);
  }
}

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}
