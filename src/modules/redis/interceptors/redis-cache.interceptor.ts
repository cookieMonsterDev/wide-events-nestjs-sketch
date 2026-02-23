import {
  Injectable,
  CallHandler,
  NestInterceptor,
  ExecutionContext,
} from '@nestjs/common';
import { tap } from 'rxjs/operators';
import { Observable, from } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { RedisCacheService } from '../servises/redis-cache.servise';
import { RedisCache } from '../decorators/redis-cache.decorator';
import { CacheStoreType } from '../redis.types';

@Injectable()
export class RedisCacheInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const options = this.reflector.get(RedisCache, context.getHandler());

    if (!options) return next.handle();

    const args = context.getArgs();

    const argsString = JSON.stringify(args);
    const className = context.getClass().name;
    const handlerName = context.getHandler().name;

    const key = options.key
      ? options.key(...args)
      : `cache:${className}:${handlerName}:${argsString}`;

    const useSetCache = options.type === CacheStoreType.SET;

    if (useSetCache) {
      const cachedSet = await this.redisCacheService.getSet(key);

      if (cachedSet !== null) return from([cachedSet]);

      return next.handle().pipe(
        tap(async (data: unknown[]) => {
          const ttl = options.ttl;

          if (Array.isArray(data) && data.length > 0) {
            await this.redisCacheService.addMultipleToSet(key, data, ttl);
          } else if (Array.isArray(data)) {
            await this.redisCacheService.setSetEmpty(key, ttl);
          }
        }),
      );
    }

    const cachedData = await this.redisCacheService.get(key);

    if (cachedData !== null) return from([cachedData]);

    return next
      .handle()
      .pipe(
        tap(async (data) => this.redisCacheService.set(key, data, options.ttl)),
      );
  }
}
