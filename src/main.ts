import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '1mb' });
  const config = app.get(ConfigService);
  const corsOrigin = config.get<string>('CORS_ORIGIN');
  const port = config.get<number>('PORT', 3000);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: corsOrigin
      ? corsOrigin.split(',').map((origin) => origin.trim()).filter(Boolean)
      : true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableShutdownHooks();
  await app.listen(port, config.get<string>('HOST', '127.0.0.1'));
}

void bootstrap();
