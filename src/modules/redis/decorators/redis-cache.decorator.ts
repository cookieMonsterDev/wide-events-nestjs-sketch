import { Reflector } from '@nestjs/core';
import { RedisCacheOptions } from '../redis.types';

export const RedisCache = Reflector.createDecorator<RedisCacheOptions>();
