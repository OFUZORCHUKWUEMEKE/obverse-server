import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
// import { HttpExceptionFilter } from './common/filters/exceptions/http-exception.filter';
// TODO: Update the path below if the file exists elsewhere
import { HttpExceptionFilter } from './core/filters/exception/http-exception';
import { ModelExceptionFilter } from './core/filters/exception/model-exception';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter(), new ModelExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);

  app.enableCors({});
  app.useGlobalPipes(new ValidationPipe());

  app.useGlobalFilters(new HttpExceptionFilter(), new ModelExceptionFilter());

  const documentation = new DocumentBuilder()
    .setTitle('Obverse')
    .setDescription('Obverse API Documentation')
    .setVersion('1.0')
    .addTag('Obverse')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, documentation);
  SwaggerModule.setup('docs', app, document);
}
bootstrap();
