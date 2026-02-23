import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.servise';
import { SetManyOptions, REDIS_CACHE_TTL } from '../redis.types';

@Injectable()
export class RedisCacheService {
  constructor(private readonly redisService: RedisService) {}

  private get redis() {
    return this.redisService.client;
  }

  async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];

    const stream = this.redis.scanStream({ match: pattern, count: 100 });

    for await (const chunk of stream) {
      keys.push(...chunk);
    }

    return keys;
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

    await this.redis.set(key, serialized, 'EX', milliseconds);
  }

  async setMany(options: SetManyOptions): Promise<void> {
    if (options.length === 0) return;

    const pipeline = this.redis.pipeline();

    options.forEach(({ key, value, ttl }) => {
      const serialized = JSON.stringify(value);
      const milliseconds = ttl || REDIS_CACHE_TTL;
      pipeline.set(key, serialized, 'EX', milliseconds);
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

  async getSet<T>(key: string): Promise<T[] | null> {
    const emptyMarker = this.emptyMarkerKey(key);

    const [setExists, emptyExists] = await Promise.all([
      this.redis.exists(key),
      this.redis.exists(emptyMarker),
    ]);

    if (emptyExists) return [];

    if (!setExists) return null;

    const members = await this.redis.smembers(key);

    return members.map((m) => this.safeJsonParse<T>(m)!).filter(Boolean);
  }

  async addToSet<T>(
    key: string,
    item: T,
    ttl: number = REDIS_CACHE_TTL,
  ): Promise<void> {
    const emptyMarker = this.emptyMarkerKey(key);

    await this.redis.del(emptyMarker);

    const existed = await this.redis.exists(key);

    await this.redis.sadd(key, JSON.stringify(item));

    if (!existed) await this.redis.expire(key, ttl);
  }

  async removeFromSet<T>(key: string, item: T): Promise<void> {
    await this.redis.srem(key, JSON.stringify(item));
  }

  async addMultipleToSet<T>(
    key: string,
    items: T[],
    ttl: number = REDIS_CACHE_TTL,
  ): Promise<void> {
    if (items.length === 0) return;

    const emptyMarker = this.emptyMarkerKey(key);

    await this.redis.del(emptyMarker);

    const serialized = items.map((item) => JSON.stringify(item));

    await this.redis.sadd(key, ...serialized);

    await this.redis.expire(key, ttl);
  }

  async removeMultipleFromSet<T>(key: string, items: T[]): Promise<void> {
    if (items.length === 0) return;

    const serialized = items.map((item) => JSON.stringify(item));

    await this.redis.srem(key, ...serialized);
  }

  async deleteSet(key: string): Promise<void> {
    const emptyMarker = this.emptyMarkerKey(key);

    await this.redis.del(key, emptyMarker);
  }

  async setSetEmpty(key: string, ttl: number = REDIS_CACHE_TTL): Promise<void> {
    await this.redis.set(this.emptyMarkerKey(key), '1', 'EX', ttl);
  }

  private emptyMarkerKey(key: string): string {
    return `${key}:empty`;
  }

  private safeJsonParse<T = any>(value: string): T | null {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
}
