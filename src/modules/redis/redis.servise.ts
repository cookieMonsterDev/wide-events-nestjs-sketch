import { Value } from './redis.types';
import { ConfigService } from '@nestjs/config';
import { Redis, RedisKey, RedisOptions } from 'ioredis';
import { Logger, Injectable, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private isClientEnabled: boolean = false;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {
    const options = this.getOptions();

    this.client = new Redis(options);

    this.registerListeners();
  }

  getClient(): Redis {
    return this.client;
  }

  async has(key: RedisKey): Promise<boolean> {
    if (!this.isClientEnabled) return false;

    try {
      return !!(await this.client.get(key));
    } catch (error) {
      this.logger.warn(`Redis has() failed for key ${key}: ${error.message}`);
      this.isClientEnabled = false;

      return false;
    }
  }

  async get(key: RedisKey): Promise<string | null> {
    if (!this.isClientEnabled) return null;

    try {
      return await this.client.get(key);
    } catch (error) {
      this.logger.warn(`Redis get() failed for key ${key}: ${error.message}`);
      this.isClientEnabled = false;
      return null;
    }
  }

  async set(key: RedisKey, value: Value): Promise<void> {
    if (!this.isClientEnabled) return;

    try {
      await this.client.set(key, value);
    } catch (error) {
      this.logger.warn(`Redis set() failed for key ${key}: ${error.message}`);

      this.isClientEnabled = false;
    }
  }

  async setWithExpiration(
    key: RedisKey,
    value: Value,
    ttl: number,
  ): Promise<void> {
    if (!this.isClientEnabled) return;

    try {
      const milliseconds =
        ttl || this.configService.get<number>('REDIS_CACHE_TTL', 100000);

      await this.client.set(key, value, 'PX', milliseconds);
    } catch (error) {
      this.logger.warn(
        `Redis setWithExpiration() failed for key ${key}: ${error.message}`,
      );

      this.isClientEnabled = false;
    }
  }

  async delete(key: RedisKey | RedisKey[]): Promise<void> {
    if (!this.isClientEnabled) return;

    try {
      const keys = Array.isArray(key) ? key : [key];

      await this.client.del(...keys);
    } catch (error) {
      this.logger.warn(`Redis delete() failed for key(s): ${error.message}`);

      this.isClientEnabled = false;

      return;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.isClientEnabled) return;

    try {
      await this.client.quit();
    } catch (error) {
      this.logger.warn(`Redis quit() failed: ${error.message}`);
      this.forceDisconnect();
    }
  }

  private forceDisconnect(): void {
    try {
      this.client.disconnect();
    } catch (disconnectError) {
      this.logger.error(
        `Redis disconnect() also failed: ${disconnectError.message}`,
      );
    }
  }

  private registerListeners(): void {
    this.client.on('connect', () => {
      this.isClientEnabled = true;

      this.logger.log('Redis connected');
    });

    this.client.on('ready', () => {
      this.isClientEnabled = true;

      this.logger.log('Redis ready');
    });

    this.client.on('error', (err) => {
      this.isClientEnabled = false;

      this.logger.warn(`Redis error: ${err.message}`);
    });

    this.client.on('end', () => {
      this.isClientEnabled = false;

      this.logger.warn('Redis connection ended');
    });
  }

  private retryStrategy(times: number): number {
    const maxRetry = this.configService.get<number>('REDIS_MAX_RETRY', 300000);

    const delay = Math.min(times * 1000, maxRetry);

    this.logger.debug(
      `Redis connection lost. Retry attempt ${times}, reconnecting in ${delay}ms`,
    );

    return delay;
  }

  private reconnectOnError(error: Error): boolean {
    const targetError = 'READONLY';

    if (error.message.includes(targetError)) {
      this.logger.error('Redis entered READONLY mode, reconnecting...', error);

      return true;
    }

    this.logger.error(
      'Redis error (will not trigger reconnect):',
      error.message,
    );

    return false;
  }

  private getOptions(): RedisOptions {
    return {
      autoResubscribe: true,
      enableOfflineQueue: true,
      maxRetriesPerRequest: null,
      autoResendUnfulfilledCommands: true,
      path: this.configService.get<string>('REDIS_URL', ''),
      family: this.configService.get<number>('REDIS_FAMILY', 4),
      keepAlive: this.configService.get<number>('REDIS_KEEP_ALIVE', 5000),
      lazyConnect: this.configService.get<boolean>('REDIS_LAZY_CONNECT', false),
      commandTimeout: this.configService.get<number>(
        'REDIS_COMMAND_TIMEOUT',
        5000,
      ),
      connectTimeout: this.configService.get<number>(
        'REDIS_CONNECT_TIMEOUT',
        10000,
      ),
      enableReadyCheck: this.configService.get<boolean>(
        'REDIS_ENABLE_READY_CHECK',
        true,
      ),
      retryStrategy: (times: number) => this.retryStrategy(times),
      reconnectOnError: (error: Error) => this.reconnectOnError(error),
    } satisfies RedisOptions;
  }
}
