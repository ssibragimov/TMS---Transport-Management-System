import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '@prisma/client';
import type { Response } from 'express';
import { PERMISSIONS } from '@gsm/shared';

import { AuditAs, Audited } from '@/common/audit/audit.interceptor';
import { CurrentOffice, RequirePermissions } from '@/common/decorators';
import { StorageService } from '@/common/storage/storage.service';

import {
  CreateVehicleDto,
  MeterAdjustmentDto,
  TechnicalInspectionDto,
  TransferVehicleDto,
  UpdateVehicleDto,
  VehicleDocumentDto,
  VehicleQueryDto,
} from './dto/vehicle.dto';
import { VehiclesService } from './vehicles.service';

@ApiTags('vehicles')
@Audited('Vehicle')
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.VEHICLE_READ)
  @ApiOperation({ summary: 'Список техники активного офиса' })
  list(@CurrentOffice() officeId: number, @Query() query: VehicleQueryDto) {
    return this.vehicles.list(officeId, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.VEHICLE_READ)
  @ApiOperation({ summary: 'Карточка техники с документами, нормами и приписками' })
  findOne(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.vehicles.findOne(officeId, id);
  }

  @Get('documents/expiring')
  @RequirePermissions(PERMISSIONS.VEHICLE_READ)
  @ApiQuery({ name: 'days', required: false, example: 30 })
  @ApiOperation({ summary: 'Документы техники с истекающим сроком' })
  expiringDocuments(@CurrentOffice() officeId: number, @Query('days') days?: string) {
    return this.vehicles.expiringDocuments(officeId, days ? Number(days) : 30);
  }

  @Get(':id/meters')
  @RequirePermissions(PERMISSIONS.VEHICLE_READ)
  @ApiOperation({ summary: 'История показаний счётчиков' })
  meters(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.vehicles.meterHistory(officeId, id);
  }

  @Post(':id/meters')
  @Audited('VehicleMeterReading')
  @AuditAs(AuditAction.CREATE)
  @RequirePermissions(PERMISSIONS.VEHICLE_METER_ADJUST)
  @ApiOperation({
    summary: 'Корректировка показаний счётчика',
    description: 'Оформляется как запись в истории с обязательным основанием.',
  })
  adjustMeter(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MeterAdjustmentDto,
  ) {
    return this.vehicles.adjustMeter(officeId, id, dto);
  }

  @Post(':id/technical-inspections')
  @Audited('TechnicalInspection')
  @AuditAs(AuditAction.CREATE)
  @RequirePermissions(PERMISSIONS.VEHICLE_TECHNICAL_INSPECT)
  @ApiOperation({
    summary: 'Предрейсовый контроль технического состояния',
    description:
      'Право vehicle.technical.inspect отделено от vehicle.update: диспетчер, ' +
      'правящий карточку техники, не подписывает заключение о её исправности.',
  })
  addTechnicalInspection(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TechnicalInspectionDto,
  ) {
    return this.vehicles.addTechnicalInspection(officeId, id, dto);
  }

  @Get(':id/technical-clearance')
  @RequirePermissions(PERMISSIONS.VEHICLE_READ)
  @ApiOperation({
    summary: 'Действующее заключение механика по технике',
    description: 'Основание, по которому диспетчер вправе выпустить машину на линию.',
  })
  technicalClearance(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.vehicles.technicalClearanceOf(officeId, id);
  }

  @Get(':id/documents')
  @RequirePermissions(PERMISSIONS.VEHICLE_READ)
  @ApiOperation({ summary: 'Документы техники' })
  documents(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.vehicles.listDocuments(officeId, id);
  }

  @Post(':id/documents')
  @Audited('VehicleDocument')
  @RequirePermissions(PERMISSIONS.VEHICLE_DOCUMENT_MANAGE)
  @ApiOperation({ summary: 'Добавление документа' })
  createDocument(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VehicleDocumentDto,
  ) {
    return this.vehicles.createDocument(officeId, id, dto);
  }

  @Patch(':id/documents/:documentId')
  @Audited('VehicleDocument')
  @RequirePermissions(PERMISSIONS.VEHICLE_DOCUMENT_MANAGE)
  @ApiOperation({ summary: 'Изменение документа' })
  updateDocument(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body() dto: VehicleDocumentDto,
  ) {
    return this.vehicles.updateDocument(officeId, id, documentId, dto);
  }

  @Delete(':id/documents/:documentId')
  @Audited('VehicleDocument')
  @RequirePermissions(PERMISSIONS.VEHICLE_DOCUMENT_MANAGE)
  @ApiOperation({ summary: 'Удаление документа' })
  removeDocument(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    return this.vehicles.removeDocument(officeId, id, documentId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.VEHICLE_CREATE)
  @ApiOperation({ summary: 'Постановка техники на учёт' })
  create(@CurrentOffice() officeId: number, @Body() dto: CreateVehicleDto) {
    return this.vehicles.create(officeId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.VEHICLE_UPDATE)
  @ApiOperation({ summary: 'Изменение карточки техники' })
  update(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.vehicles.update(officeId, id, dto);
  }

  @Post(':id/transfer')
  @AuditAs(AuditAction.UPDATE)
  @RequirePermissions(PERMISSIONS.VEHICLE_TRANSFER)
  @ApiOperation({
    summary: 'Перевод техники в другой аэропорт',
    description:
      'Закрывает текущий период приписки и открывает новый. ' +
      'Отчёты за прошлые периоды остаются за прежним офисом.',
  })
  transfer(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransferVehicleDto,
  ) {
    return this.vehicles.transfer(officeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.VEHICLE_DELETE)
  @ApiOperation({ summary: 'Списание техники с учёта (мягкое удаление)' })
  remove(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.vehicles.remove(officeId, id);
  }

  // ─── Фотографии ──────────────────────────────────────────────────────────

  @Get(':id/photos')
  @RequirePermissions(PERMISSIONS.VEHICLE_READ)
  @ApiOperation({ summary: 'Список фотографий техники' })
  photos(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.vehicles.listPhotos(officeId, id);
  }

  /**
   * Сам файл отдаётся через API, а не статикой: иначе, угадав ссылку,
   * снимок техники чужого аэропорта можно было бы получить без авторизации.
   */
  @Get(':id/photos/:photoId/content')
  @RequirePermissions(PERMISSIONS.VEHICLE_READ)
  @ApiOperation({ summary: 'Содержимое фотографии' })
  async photoContent(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('photoId', ParseIntPipe) photoId: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { stream, photo } = await this.vehicles.readPhoto(officeId, id, photoId);

    res.setHeader('Content-Type', photo.mimeType);
    res.setHeader('Content-Length', photo.sizeBytes);
    // Приватный кэш: снимок принадлежит офису, промежуточным прокси его
    // хранить нельзя, а в браузере пользователя — можно.
    res.setHeader('Cache-Control', 'private, max-age=86400');

    return new StreamableFile(stream);
  }

  @Post(':id/photos')
  @Audited('VehiclePhoto')
  @AuditAs(AuditAction.CREATE)
  @RequirePermissions(PERMISSIONS.VEHICLE_UPDATE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: StorageService.MAX_IMAGE_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        caption: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Загрузка фотографии (JPEG, PNG, WebP, HEIC, до 10 МБ)' })
  uploadPhoto(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('caption') caption?: string,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'storage.file_required',
        message: 'Файл не передан',
      });
    }
    return this.vehicles.addPhoto(officeId, id, file, caption);
  }

  @Patch(':id/photos/:photoId/primary')
  @Audited('VehiclePhoto')
  @AuditAs(AuditAction.UPDATE)
  @RequirePermissions(PERMISSIONS.VEHICLE_UPDATE)
  @ApiOperation({ summary: 'Сделать фотографию главной' })
  setPrimaryPhoto(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('photoId', ParseIntPipe) photoId: number,
  ) {
    return this.vehicles.setPrimaryPhoto(officeId, id, photoId);
  }

  @Delete(':id/photos/:photoId')
  @Audited('VehiclePhoto')
  @RequirePermissions(PERMISSIONS.VEHICLE_UPDATE)
  @ApiOperation({ summary: 'Удаление фотографии' })
  removePhoto(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Param('photoId', ParseIntPipe) photoId: number,
  ) {
    return this.vehicles.removePhoto(officeId, id, photoId);
  }
}

/**
 * Техконтроль — рабочее место механика.
 *
 * Отдельный контроллер, а не вкладка в технике: механик приходит в систему
 * за одним действием и работает в темпе очереди перед сменой.
 */
@ApiTags('technical')
@Controller('technical')
export class TechnicalController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get('queue')
  @RequirePermissions(PERMISSIONS.VEHICLE_READ)
  @ApiQuery({ name: 'search', required: false })
  @ApiOperation({
    summary: 'Очередь техконтроля: техника офиса и состояние её допуска',
    description: 'Показывает и осмотренную, и ещё не поданную — механик видит, что ждать.',
  })
  queue(@CurrentOffice() officeId: number, @Query('search') search?: string) {
    return this.vehicles.technicalQueue(officeId, search);
  }
}