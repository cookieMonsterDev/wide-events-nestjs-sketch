import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RedisService } from './redis.servise';
import { Global, Module } from '@nestjs/common';
import { RedisCacheInterceptor } from './interceptors/redis-cache.interceptor';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    RedisService,
    {
      provide: APP_INTERCEPTOR,
      useClass: RedisCacheInterceptor,
    },
  ],
  exports: [RedisService],
})
export class RedisModule {}
