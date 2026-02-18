import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { ApiResponseInterceptor } from './common/http/api-response.interceptor';
import { SensitiveFieldsInterceptor } from './common/interceptors/sensitive-fields.interceptor';
import { flattenValidationErrors } from './common/validation/validation-details';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      exceptionFactory: (errors) =>
        new BadRequestException({
          message: 'Validation failed',
          details: flattenValidationErrors(errors),
        }),
    }),
  );

  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(
    new ApiResponseInterceptor(app.get(Reflector)),
    new SensitiveFieldsInterceptor(),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Gold Trading API')
    .setDescription(
      'API documentation for the gold trading platform: accounts, trades, deposits, withdrawals, gold lots, and file storage.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const configService = app.get(ConfigService);

  const trustProxy =
    (configService.get<string>('TRUST_PROXY') ?? 'false').toString().toLowerCase() === 'true';
  if (trustProxy) {
    const httpAdapter = app.getHttpAdapter();
    const instance: any = httpAdapter.getInstance?.();
    if (instance?.set) {
      instance.set('trust proxy', 1);
    }
  }
  const corsOriginRaw =
    configService.get<string>('CORS_ORIGIN') || 'http://localhost:3100';

  const corsOrigins = corsOriginRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,          // ✅ چند origin
    credentials: true,            // اگر کوکی/سشن داری
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'X-Idempotency-Key',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
  });

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port);
}
bootstrap();
