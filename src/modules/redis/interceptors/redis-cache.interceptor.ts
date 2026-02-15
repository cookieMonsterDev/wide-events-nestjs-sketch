import {
  Injectable,
  CallHandler,
  NestInterceptor,
  ExecutionContext,
} from '@nestjs/common';
import { tap } from 'rxjs/operators';
import { Observable, from } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../redis.servise';
import { RedisCache } from '../decorators/redis-cache.decorator';

@Injectable()
export class RedisCacheInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
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

    const cachedData = await this.redisService.client.get(key);

    if (cachedData) {
      const parsed = this.parseJson(cachedData);

      if (parsed !== null) return from([parsed]);
    }

    return next
      .handle()
      .pipe(tap(async (data) => this.cacheResult(key, data, options.ttl)));
  }

  private async cacheResult(
    key: string,
    data: any,
    ttl?: number,
  ): Promise<void> {
    const value = JSON.stringify(data);

    if (ttl) {
      await this.redisService.client.set(key, value, 'PX', ttl);
      return;
    }

    await this.redisService.client.set(key, value, 'PX', 10000);
  }

  private parseJson(value: string): any | null {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
}
