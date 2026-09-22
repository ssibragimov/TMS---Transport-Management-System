import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuditAction } from '@prisma/client';
import type { Response } from 'express';
import { PERMISSIONS } from '@gsm/shared';

import { AuditAs, Audited } from '@/common/audit/audit.interceptor';
import { sendCsv } from '@/common/csv/csv';
import { CurrentOffice, RequirePermissions } from '@/common/decorators';

import { ViolationDto, ViolationQueryDto } from './dto/violation.dto';
import { ViolationsService } from './violations.service';

/**
 * Журнал нарушений — рабочее место службы безопасности дорог аэропорта.
 *
 * Отдельный модуль, а не вложенные роуты внутри водителей: право оформлять
 * нарушение (violation.manage) не пересекается ни с одним правом на карточку
 * водителя, и в перспективе с этим экраном работают с планшета прямо
 * на перроне — самостоятельный, максимально короткий путь до формы важнее,
 * чем переиспользование маршрутов /drivers/:id/*.
 */
@ApiTags('violations')
@Audited('Violation')
@Controller('violations')
export class ViolationsController {
  constructor(private readonly violations: ViolationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VIOLATION_READ)
  @ApiOperation({ summary: 'Журнал нарушений активного офиса' })
  list(@CurrentOffice() officeId: number, @Query() query: ViolationQueryDto) {
    return this.violations.list(officeId, query);
  }

  /*
   * Статический путь объявлен раньше ':id' намеренно: иначе Express примет
   * "export.csv" за значение параметра id (см. тот же приём в waybills).
   */
  @Get('export.csv')
  @Audited('Violation')
  @AuditAs(AuditAction.EXPORT)
  @RequirePermissions(PERMISSIONS.VIOLATION_READ)
  @ApiOperation({ summary: 'Выгрузка журнала нарушений в Excel (CSV)' })
  async exportList(
    @CurrentOffice() officeId: number,
    @Query() query: ViolationQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.violations.exportList(officeId, query);
    sendCsv(res, csv, `narusheniya_${new Date().toISOString().slice(0, 10)}.csv`);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.VIOLATION_READ)
  @ApiOperation({ summary: 'Карточка нарушения' })
  findOne(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.violations.findOne(officeId, id);
  }

  @Get(':id/export.csv')
  @Audited('Violation')
  @AuditAs(AuditAction.EXPORT)
  @RequirePermissions(PERMISSIONS.VIOLATION_READ)
  @ApiOperation({ summary: 'Выгрузка одного нарушения в Excel (CSV)' })
  async exportOne(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.violations.exportOne(officeId, id);
    sendCsv(res, csv, `narushenie-${id}.csv`);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.VIOLATION_MANAGE)
  @ApiOperation({ summary: 'Оформить нарушение' })
  create(@CurrentOffice() officeId: number, @Body() dto: ViolationDto) {
    return this.violations.create(officeId, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.VIOLATION_MANAGE)
  @ApiOperation({
    summary: 'Удалить запись о нарушении',
    description: 'Журнал без правки: ошибку оформления исправляют удалением, а не редактированием.',
  })
  remove(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.violations.remove(officeId, id);
  }

  @Post(':id/photo')
  @RequirePermissions(PERMISSIONS.VIOLATION_MANAGE)
  @ApiOperation({ summary: 'Фото/вложение с места нарушения' })
  @UseInterceptors(FileInterceptor('file'))
  uploadPhoto(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.violations.setPhoto(officeId, id, file);
  }

  @Get(':id/photo')
  @RequirePermissions(PERMISSIONS.VIOLATION_READ)
  @ApiOperation({ summary: 'Получить фото нарушения' })
  async getPhoto(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, mimeType } = await this.violations.readPhoto(officeId, id);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=86400');

    return new StreamableFile(stream);
  }

  @Delete(':id/photo')
  @RequirePermissions(PERMISSIONS.VIOLATION_MANAGE)
  @ApiOperation({ summary: 'Удалить фото нарушения' })
  removePhoto(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.violations.removePhoto(officeId, id);
  }
}

@Module({
  controllers: [ViolationsController],
  providers: [ViolationsService],
  exports: [ViolationsService],
})
export class ViolationsModule {}
