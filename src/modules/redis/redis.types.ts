export const REDIS_CACHE_TTL = 86400;

export type RedisCacheOptions = {
  ttl?: number;
  key?: (...args: any[]) => string;
};

export type RedisCacheInvalidateOptions = {
  pattern?: string | ((...args: any[]) => string);
};

export type SetManyOptions = Array<{ key: string; value: any; ttl?: number }>;
