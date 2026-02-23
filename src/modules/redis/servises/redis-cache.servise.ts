import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.servise';
import { SetManyOptions, REDIS_CACHE_TTL } from '../redis.types';

@Injectable()
export class RedisCacheService {
  constructor(private readonly redisService: RedisService) {}

  private get redis() {
    return this.redisService.client;
  }

  async has(key: string): Promise<boolean> {
    const exists = await this.redis.exists(key);

    return exists === 1;
  }

  async get<T = any>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);

    if (!value) return null;

    return this.safeJsonParse<T>(value);
  }

  async getMany<T = any>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];

    const pipeline = this.redis.pipeline();

    keys.forEach((key) => pipeline.get(key));

    const results = await pipeline.exec();

    if (!results) return [];

    return results.map(([err, value]) => {
      if (err || !value) return null;

      return this.safeJsonParse<T>(value as string);
    });
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);

    const milliseconds = ttl || REDIS_CACHE_TTL;

    await this.redis.set(key, serialized, 'PX', milliseconds);
  }

  async setMany(options: SetManyOptions): Promise<void> {
    if (options.length === 0) return;

    const pipeline = this.redis.pipeline();

    options.forEach(({ key, value, ttl }) => {
      const serialized = JSON.stringify(value);
      const milliseconds = ttl || REDIS_CACHE_TTL;
      pipeline.set(key, serialized, 'PX', milliseconds);
    });

    await pipeline.exec();
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    const pipeline = this.redis.pipeline();

    keys.forEach((key) => pipeline.del(key));

    await pipeline.exec();
  }

  async deleteManyForItems<T>(
    items: T[] | null | undefined,
    key: (item: T) => string,
  ): Promise<void> {
    if (!items || items.length === 0) return;

    const keys = items.map(key);

    await this.deleteMany(keys);
  }

  private safeJsonParse<T = any>(value: string): T | null {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
}
