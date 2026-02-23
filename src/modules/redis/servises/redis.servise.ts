import { Redis, RedisOptions } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { Logger, Injectable, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {
    const options = this.getClientOptions();

    this.client = this.createProxyClient(options);

    this.registerListeners();
  }

  async onModuleDestroy(): Promise<void> {
    const result = await this.client.quit();

    if (result === null) this.client.disconnect();
  }

  private createProxyClient(options: RedisOptions): Redis {
    const client = new Redis(options);

    // EventEmitter methods and internal methods
    const excludedMethods = new Set([
      'on',
      'off',
      'emit',
      'once',
      'quit',
      'multi',
      'status',
      'connect',
      'options',
      'command',
      'pipeline',
      'listeners',
      'duplicate',
      'scanStream',
      'addListener',
      'eventNames',
      'disconnect',
      'createStream',
      'rawListeners',
      'removeListener',
      'listenerCount',
      'getMaxListeners',
      'setMaxListeners',
      'prependListener',
      'createDumpStream',
      'removeAllListeners',
      'createRestoreStream',
      'prependOnceListener',
    ]);

    return new Proxy(client, {
      get: (target, prop) => {
        const original = target[prop];

        if (typeof original !== 'function') return original;

        if (excludedMethods.has(String(prop))) return original.bind(target);

        return async (...args: any[]) => {
          let status = target.status;

          const errorStatuses = ['end', 'close', 'reconnecting'];

          if (errorStatuses.includes[status]) return null;

          try {
            const result = original.apply(target, args);
            return result instanceof Promise ? await result : result;
          } catch (error) {
            status = target.status;

            const errorMessage =
              error instanceof Error ? error.message : String(error);

            if (
              errorStatuses.includes[status] ||
              errorMessage.includes('Connection is closed')
            )
              return null;

            this.logger.error(
              `Redis error on method [${String(prop)}]: ${errorMessage}`,
            );
            return null;
          }
        };
      },
    });
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
    const maxRetry =
      parseInt(this.configService.get('REDIS_MAX_RETRY', '300000'), 10) ||
      300000;

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

  private getClientOptions(): RedisOptions {
    const redisUrl = this.configService.get(
      'REDIS_URL',
      'redis://localhost:6379',
    );
    const url = new URL(redisUrl);

    return {
      autoResubscribe: true,
      enableOfflineQueue: true,
      maxRetriesPerRequest: null,
      autoResendUnfulfilledCommands: true,
      host: url.hostname,
      port: parseInt(url.port, 10) || 6379,
      family: parseInt(this.configService.get('REDIS_FAMILY', '4'), 10) || 4,
      keepAlive:
        parseInt(this.configService.get('REDIS_KEEP_ALIVE', '5000'), 10) ||
        5000,
      lazyConnect:
        this.configService.get('REDIS_LAZY_CONNECT', 'false') === 'true',
      commandTimeout:
        parseInt(this.configService.get('REDIS_COMMAND_TIMEOUT', '5000'), 10) ||
        5000,
      connectTimeout:
        parseInt(
          this.configService.get('REDIS_CONNECT_TIMEOUT', '10000'),
          10,
        ) || 10000,
      enableReadyCheck:
        this.configService.get('REDIS_ENABLE_READY_CHECK', 'true') === 'true',
      retryStrategy: (times: number) => this.retryStrategy(times),
      reconnectOnError: (error: Error) => this.reconnectOnError(error),
    } satisfies RedisOptions;
  }
}
