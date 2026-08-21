import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AppConfigModule } from '@/config/config.module';
import { AuditInterceptor } from '@/common/audit/audit.interceptor';
import { CommonModule } from '@/common/common.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { PrismaModule } from '@/common/prisma/prisma.module';
import { StorageModule } from '@/common/storage/storage.module';
import { TenantMiddleware } from '@/common/tenancy/tenant.middleware';

import { AuditModule } from '@/modules/audit/audit.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { DictionariesModule } from '@/modules/dictionaries/dictionaries.module';
import { DriversModule } from '@/modules/drivers/drivers.module';
import { FuelModule } from '@/modules/fuel/fuel.module';
import { HealthModule } from '@/modules/health/health.module';
import { OfficesModule } from '@/modules/offices/offices.module';
import { ReportsModule } from '@/modules/reports/reports.module';
import { StockModule } from '@/modules/stock/stock.module';
import { TelemetryModule } from '@/modules/telemetry/telemetry.module';
import { UsersModule } from '@/modules/users/users.module';
import { VehiclesModule } from '@/modules/vehicles/vehicles.module';
import { WaybillsModule } from '@/modules/waybills/waybills.module';

@Module({
  imports: [
    // Порядок важен: forRoot() читает .env в process.env, и только затем
    // AppConfigModule валидирует его и собирает типизированный конфиг.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    AppConfigModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),

    PrismaModule,
    StorageModule,
    CommonModule,

    AuthModule,
    UsersModule,
    OfficesModule,
    DictionariesModule,
    VehiclesModule,
    DriversModule,
    FuelModule,
    WaybillsModule,
    StockModule,
    TelemetryModule,
    ReportsModule,
    AuditModule,
    HealthModule,
  ],
  providers: [
    // Порядок важен: сначала аутентификация (она же наполняет контекст
    // арендатора), затем проверка прав, затем ограничение частоты.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },

    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Контекст запроса создаётся до guard'ов, чтобы AsyncLocalStorage
    // накрыл весь конвейер обработки.
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
