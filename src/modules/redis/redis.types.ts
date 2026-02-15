export type RedisCacheOptions = {
  ttl?: number;
  key?: (...args: any[]) => string;
};

export type RedisCacheInvalidateOptions = {
  pattern?: string | ((...args: any[]) => string);
};
