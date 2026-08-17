import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const isProduction = config.get<string>('NODE_ENV') === 'production';

  // Nginx 뒤에서는 X-Forwarded-For를 믿어야 rate limit이 실제 클라이언트 IP를 본다.
  if (config.get<string>('TRUST_PROXY') === 'true') {
    app.set('trust proxy', 1);
  }

  // 보안 헤더. API 전용이라 CSP는 끄고(스웨거 UI 충돌 방지) 나머지 기본값을 쓴다.
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS 화이트리스트 — 미설정(로컬 개발)이면 허용하지 않는다(앱은 CORS 대상이 아님).
  const origins = parseOrigins(config.get<string>('CORS_ORIGINS'));
  if (origins.length > 0) {
    app.enableCors({ origin: origins, credentials: true });
  }

  // API 버전 prefix — 계약 Base URL: https://api.pacer.app/v1
  app.setGlobalPrefix('v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  // Swagger — 운영에서는 노출하지 않는다.
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Pacer API')
      .setDescription('면접의 페이스를 잡아주는 AI 코치 — 서버 API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(config.get<number>('PORT') ?? 3000);
}

function parseOrigins(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

void bootstrap();
