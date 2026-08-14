import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get<AppConfig>(APP_CONFIG);
  const logger = new Logger('Bootstrap');

  app.setGlobalPrefix(config.api.prefix);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.enableCors({
    origin: config.api.corsOrigins,
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Отбрасываем всё, чего нет в DTO: клиент не должен иметь возможности
      // дописать в запрос office_id или status и обойти бизнес-логику.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  if (!config.isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('GSM Platform API')
      .setDescription(
        'Учёт спецтранспорта, ГСМ и путевых листов аэропортов Узбекистана',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${config.api.prefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  app.enableShutdownHooks();

  await app.listen(config.api.port);

  logger.log(`API слушает http://localhost:${config.api.port}/${config.api.prefix}`);
  if (!config.isProduction) {
    logger.log(`Swagger: http://localhost:${config.api.port}/${config.api.prefix}/docs`);
  }
}

void bootstrap();
