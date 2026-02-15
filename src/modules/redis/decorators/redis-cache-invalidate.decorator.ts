import { Reflector } from '@nestjs/core';
import { RedisCacheInvalidateOptions } from '../redis.types';

export const RedisCacheInvalidate =
  Reflector.createDecorator<RedisCacheInvalidateOptions>();
