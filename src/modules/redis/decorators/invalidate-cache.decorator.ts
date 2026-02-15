import { Reflector } from '@nestjs/core';
import { InvalidateCacheOptions } from '../redis.types';

export const InvalidateCache = Reflector.createDecorator<InvalidateCacheOptions>();
