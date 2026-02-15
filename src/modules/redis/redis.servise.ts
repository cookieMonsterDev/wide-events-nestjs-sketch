import { Redis, RedisOptions } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { Logger, Injectable, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {
    const options = this.getOptions();

    this.client = this.createProxyClient(options);

    this.registerListeners();
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch (error) {
      this.logger.warn(`Redis quit() failed: ${error.message}`);
      this.forceDisconnect();
    }
  }

  private createProxyClient(options: RedisOptions): Redis {
    const client = new Redis(options);

    return new Proxy(client, {
      get: (target, prop) => {
        const original = target[prop];

        if (typeof original !== 'function') return original;

        return async (...args: any[]) => {
          try {
            return await original.apply(target, args);
          } catch (error) {
            this.logger.error(
              `Redis error on method [${String(prop)}]: ${error.message}`,
            );
            return null;
          }
        };
      },
    });
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
      this.logger.log('Redis connected');
    });

    this.client.on('ready', () => {
      this.logger.log('Redis ready');
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis error: ${err.message}`);
    });

    this.client.on('end', () => {
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
