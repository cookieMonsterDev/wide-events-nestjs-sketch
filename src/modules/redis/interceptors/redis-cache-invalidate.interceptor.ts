import {
  Injectable,
  CallHandler,
  NestInterceptor,
  ExecutionContext,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { RedisCacheService } from '../servises/redis-cache.servise';
import { RedisCacheInvalidate } from '../decorators/redis-cache-invalidate.decorator';
import { RedisCacheInvalidateOptions } from '../redis.types';

@Injectable()
export class RedisCacheInvalidateInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly redisCacheService: RedisCacheService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const options = this.reflector.get(
      RedisCacheInvalidate,
      context.getHandler(),
    );

    if (!options) return next.handle();

    return next
      .handle()
      .pipe(tap(async (_data) => this.invalidateCache(context, options)));
  }

  private async invalidateCache(
    context: ExecutionContext,
    options: RedisCacheInvalidateOptions,
  ): Promise<void> {
    const args = context.getArgs();
    const className = context.getClass().name;
    const handlerName = context.getHandler().name;

    if (options.pattern) {
      const pattern =
        typeof options.pattern === 'function'
          ? options.pattern(...args)
          : options.pattern;

      const keys = await this.redisCacheService.scanKeys(pattern);

      if (keys.length > 0) await this.redisCacheService.deleteMany(keys);

      return;
    }

    const argsString = JSON.stringify(args);

    const exactKey = `cache:${className}:${handlerName}:${argsString}`;

    await this.redisCacheService.delete(exactKey);
  }
}
