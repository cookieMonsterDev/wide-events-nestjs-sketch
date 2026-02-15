export type RedisCacheOptions = {
  ttl?: number;
  key?: (...args: any[]) => string;
};

export type InvalidateCacheOptions = {
  pattern?: string | ((...args: any[]) => string);
};
