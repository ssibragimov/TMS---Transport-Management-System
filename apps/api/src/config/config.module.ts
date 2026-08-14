import { Global, Module } from '@nestjs/common';

import { APP_CONFIG, loadConfiguration } from './configuration';

/**
 * Конфигурация как глобальный провайдер.
 *
 * @Global обязателен: APP_CONFIG нужен PrismaService и JwtStrategy, которые
 * живут в собственных модулях. Без глобальной регистрации каждому из них
 * пришлось бы импортировать этот модуль явно.
 *
 * Фабрика выполняется один раз при построении контекста — после того, как
 * ConfigModule.forRoot() уже загрузил .env в process.env.
 */
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: loadConfiguration }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
