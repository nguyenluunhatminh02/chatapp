import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './websockets/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // WebSocket Redis adapter (dùng REDIS_URL của bạn)
  const wsAdapter = new RedisIoAdapter(app);
  await wsAdapter.connectToRedis(
    process.env.REDIS_URL || 'redis://localhost:6379',
  );
  app.useWebSocketAdapter(wsAdapter);

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  console.log(`✅ API ready at http://localhost:${port}`);
}
bootstrap();
