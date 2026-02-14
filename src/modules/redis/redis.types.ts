export type Value = string | Buffer | number;

export type RedisCacheOptions = {
  ttl?: number;
  key?: string | (() => string) | ((...args: any[]) => string);
};
