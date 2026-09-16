import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Controller, Get, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '@/common/decorators';
import { PrismaService } from '@/common/prisma/prisma.service';

/**
 * Версия читается из корневого package.json, а не хранится тут отдельной
 * строкой — тот же источник правды, что и у веб-сборки (см. vite.config.ts).
 * __dirname у скомпилированного файла (dist/modules/health) лежит на той же
 * глубине от корня репозитория, что и исходник (src/modules/health),
 * поэтому путь одинаково верен в dev и в собранном виде.
 */
const PLATFORM_VERSION = (
  JSON.parse(
    readFileSync(join(__dirname, '../../../../../package.json'), 'utf-8'),
  ) as { version: string }
).version;

@ApiTags('health')
@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Живость процесса' })
  live(): { status: string; timestamp: string; version: string } {
    return { status: 'ok', timestamp: new Date().toISOString(), version: PLATFORM_VERSION };
  }

  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Готовность: проверяется доступность БД' })
  async ready(): Promise<{ status: string; database: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch {
      return { status: 'degraded', database: 'down' };
    }
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
