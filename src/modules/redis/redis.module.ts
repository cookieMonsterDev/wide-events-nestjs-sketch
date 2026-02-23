import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Global, Module } from '@nestjs/common';
import { RedisService } from './servises/redis.servise';
import { RedisCacheService } from './servises/redis-cache.servise';
import { RedisCacheInterceptor } from './interceptors/redis-cache.interceptor';
import { RedisCacheInvalidateInterceptor } from './interceptors/redis-cache-invalidate.interceptor';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    RedisService,
    RedisCacheService,
    {
      provide: APP_INTERCEPTOR,
      useClass: RedisCacheInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RedisCacheInvalidateInterceptor,
    },
  ],
  exports: [RedisService, RedisCacheService],
})
export class RedisModule {}
