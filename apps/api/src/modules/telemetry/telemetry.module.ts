import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@gsm/shared';

import { Audited } from '@/common/audit/audit.interceptor';
import { CurrentOffice, RequirePermissions } from '@/common/decorators';

import {
  CreateDeviceDto,
  GeofenceDto,
  GeofenceEventQueryDto,
  IngestDto,
  TrackQueryDto,
  UpdateDeviceDto,
  UpdateGeofenceDto,
} from './dto/telemetry.dto';
import { GeofencesService } from './geofences.service';
import { TelemetryService } from './telemetry.service';

@ApiTags('telemetry')
@Audited('Telemetry')
@Controller('telemetry')
export class TelemetryController {
  constructor(
    private readonly telemetry: TelemetryService,
    private readonly registry: GeofencesService,
  ) {}

  /**
   * Точка входа для данных с трекеров.
   *
   * Сейчас закрыта обычным правом: пачки шлёт либо имитатор, либо служебная
   * учётка шлюза. Когда появится приём напрямую от трекеров, у шлюза будет
   * собственный способ аутентификации — endpoint останется тем же.
   */
  @Post('ingest')
  @RequirePermissions(PERMISSIONS.TELEMETRY_MANAGE)
  @ApiOperation({
    summary: 'Приём пачки точек',
    description:
      'Точка с неизвестным IMEI или сбитой датой отклоняется поимённо, ' +
      'остальные точки пачки принимаются.',
  })
  ingest(@Body() dto: IngestDto) {
    return this.telemetry.ingest(dto);
  }

  @Get('live')
  @RequirePermissions(PERMISSIONS.TELEMETRY_READ)
  @ApiOperation({
    summary: 'Последнее положение всей техники офиса',
    description: 'Техника без данных возвращается тоже — со статусом NO_DATA.',
  })
  live(@CurrentOffice() officeId: number) {
    return this.telemetry.live(officeId);
  }

  @Get('vehicles/:vehicleId/track')
  @RequirePermissions(PERMISSIONS.TELEMETRY_READ)
  @ApiOperation({ summary: 'Трек машины за период с расчётом пробега' })
  track(
    @CurrentOffice() officeId: number,
    @Param('vehicleId', ParseIntPipe) vehicleId: number,
    @Query() query: TrackQueryDto,
  ) {
    return this.telemetry.track(officeId, vehicleId, query);
  }

  // ─── Трекеры ──────────────────────────────────────────────────────────────

  @Get('devices')
  @RequirePermissions(PERMISSIONS.TELEMETRY_READ)
  @ApiOperation({ summary: 'Реестр трекеров' })
  devices(@CurrentOffice() officeId: number) {
    return this.registry.listDevices(officeId);
  }

  @Post('devices')
  @Audited('GpsDevice')
  @RequirePermissions(PERMISSIONS.TELEMETRY_MANAGE)
  @ApiOperation({ summary: 'Регистрация трекера' })
  createDevice(@CurrentOffice() officeId: number, @Body() dto: CreateDeviceDto) {
    return this.registry.createDevice(officeId, dto);
  }

  @Patch('devices/:id')
  @Audited('GpsDevice')
  @RequirePermissions(PERMISSIONS.TELEMETRY_MANAGE)
  @ApiOperation({ summary: 'Изменение или снятие трекера' })
  updateDevice(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDeviceDto,
  ) {
    return this.registry.updateDevice(officeId, id, dto);
  }

  @Delete('devices/:id')
  @Audited('GpsDevice')
  @RequirePermissions(PERMISSIONS.TELEMETRY_MANAGE)
  @ApiOperation({ summary: 'Удаление трекера из реестра. Трек машины сохраняется.' })
  removeDevice(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.registry.removeDevice(officeId, id);
  }

  // ─── События геозон ───────────────────────────────────────────────────────

  @Get('events')
  @RequirePermissions(PERMISSIONS.TELEMETRY_READ)
  @ApiOperation({ summary: 'Пересечения границ геозон' })
  events(@CurrentOffice() officeId: number, @Query() query: GeofenceEventQueryDto) {
    return this.registry.listEvents(officeId, query);
  }
}

@ApiTags('telemetry')
@Audited('Geofence')
@Controller('geofences')
export class GeofencesController {
  constructor(private readonly geofences: GeofencesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TELEMETRY_READ)
  @ApiOperation({ summary: 'Геозоны офиса' })
  list(@CurrentOffice() officeId: number) {
    return this.geofences.listGeofences(officeId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.GEOFENCE_MANAGE)
  @ApiOperation({ summary: 'Создание геозоны' })
  create(@CurrentOffice() officeId: number, @Body() dto: GeofenceDto) {
    return this.geofences.createGeofence(officeId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.GEOFENCE_MANAGE)
  @ApiOperation({ summary: 'Изменение геозоны' })
  update(
    @CurrentOffice() officeId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGeofenceDto,
  ) {
    return this.geofences.updateGeofence(officeId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.GEOFENCE_MANAGE)
  @ApiOperation({ summary: 'Удаление геозоны вместе с её событиями' })
  remove(@CurrentOffice() officeId: number, @Param('id', ParseIntPipe) id: number) {
    return this.geofences.removeGeofence(officeId, id);
  }
}

@Module({
  controllers: [TelemetryController, GeofencesController],
  providers: [TelemetryService, GeofencesService],
  exports: [TelemetryService],
})
export class TelemetryModule {}
