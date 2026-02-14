import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisService } from './redis.servise';
import { Logger } from '@nestjs/common';

// Mock Logger to suppress console output during tests
jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});

// Mock ioredis
jest.mock('ioredis', () => {
  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    quit: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
  };

  const MockRedis = jest.fn().mockImplementation(() => {
    return mockRedisClient;
  });

  return {
    Redis: MockRedis,
    default: MockRedis,
  };
});

describe('RedisService', () => {
  let service: RedisService;
  let configService: ConfigService;
  let mockRedisClient: any;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        REDIS_URL: 'redis://localhost:6379',
        REDIS_FAMILY: 4,
        REDIS_KEEP_ALIVE: 5000,
        REDIS_LAZY_CONNECT: false,
        REDIS_COMMAND_TIMEOUT: 5000,
        REDIS_CONNECT_TIMEOUT: 10000,
        REDIS_ENABLE_READY_CHECK: true,
        REDIS_MAX_RETRY: 300000,
        REDIS_CACHE_TTL: 100000,
      };
      return config[key] ?? defaultValue;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    configService = module.get<ConfigService>(ConfigService);

    // Get the mock Redis client instance that was created by the service
    mockRedisClient = (service as any).client;

    // Set client as enabled by default
    (service as any).isClientEnabled = true;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create Redis client with correct options', () => {
      expect(Redis).toHaveBeenCalled();
      const callArgs = (Redis as unknown as jest.Mock).mock.calls[0][0];
      expect(callArgs).toMatchObject({
        autoResubscribe: true,
        enableOfflineQueue: true,
        maxRetriesPerRequest: null,
        autoResendUnfulfilledCommands: true,
        path: 'redis://localhost:6379',
        family: 4,
        keepAlive: 5000,
        lazyConnect: false,
        commandTimeout: 5000,
        connectTimeout: 10000,
        enableReadyCheck: true,
      });
    });

    it('should register event listeners', () => {
      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('end', expect.any(Function));
    });
  });

  describe('has', () => {
    it('should return true when key exists', async () => {
      mockRedisClient.get.mockResolvedValue('value');

      const result = await service.has('test-key');

      expect(result).toBe(true);
      expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
    });

    it('should return false when key does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.has('test-key');

      expect(result).toBe(false);
    });

    it('should return false when client is disabled', async () => {
      (service as any).isClientEnabled = false;

      const result = await service.has('test-key');

      expect(result).toBe(false);
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('should return false and disable client on error', async () => {
      const error = new Error('Connection failed');
      mockRedisClient.get.mockRejectedValue(error);

      const loggerSpy = jest.spyOn(Logger.prototype, 'warn');

      const result = await service.has('test-key');

      expect(result).toBe(false);
      expect((service as any).isClientEnabled).toBe(false);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Redis has() failed for key test-key: ${error.message}`,
      );
    });
  });

  describe('get', () => {
    it('should return value when key exists', async () => {
      const value = 'test-value';
      mockRedisClient.get.mockResolvedValue(value);

      const result = await service.get('test-key');

      expect(result).toBe(value);
      expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null when key does not exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.get('test-key');

      expect(result).toBe(null);
    });

    it('should return null when client is disabled', async () => {
      (service as any).isClientEnabled = false;

      const result = await service.get('test-key');

      expect(result).toBe(null);
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('should return null and disable client on error', async () => {
      const error = new Error('Connection failed');
      mockRedisClient.get.mockRejectedValue(error);

      const loggerSpy = jest.spyOn(Logger.prototype, 'warn');

      const result = await service.get('test-key');

      expect(result).toBe(null);
      expect((service as any).isClientEnabled).toBe(false);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Redis get() failed for key test-key: ${error.message}`,
      );
    });
  });

  describe('set', () => {
    it('should set value successfully', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      await service.set('test-key', 'test-value');

      expect(mockRedisClient.set).toHaveBeenCalledWith('test-key', 'test-value');
    });

    it('should not set when client is disabled', async () => {
      (service as any).isClientEnabled = false;

      await service.set('test-key', 'test-value');

      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it('should disable client on error', async () => {
      const error = new Error('Connection failed');
      mockRedisClient.set.mockRejectedValue(error);

      const loggerSpy = jest.spyOn(Logger.prototype, 'warn');

      await service.set('test-key', 'test-value');

      expect((service as any).isClientEnabled).toBe(false);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Redis set() failed for key test-key: ${error.message}`,
      );
    });

    it('should handle different value types', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      await service.set('key1', 'string');
      await service.set('key2', 123);
      await service.set('key3', Buffer.from('buffer'));

      expect(mockRedisClient.set).toHaveBeenCalledWith('key1', 'string');
      expect(mockRedisClient.set).toHaveBeenCalledWith('key2', 123);
      expect(mockRedisClient.set).toHaveBeenCalledWith('key3', expect.any(Buffer));
      expect(mockRedisClient.set).toHaveBeenCalledTimes(3);
    });
  });

  describe('setWithExpiration', () => {
    it('should set value with expiration using provided TTL', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      await service.setWithExpiration('test-key', 'test-value', 5000);

      expect(mockRedisClient.set).toHaveBeenCalledWith('test-key', 'test-value', 'PX', 5000);
    });

    it('should use default TTL from config when TTL is 0', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      mockConfigService.get.mockReturnValue(100000);

      await service.setWithExpiration('test-key', 'test-value', 0);

      expect(mockRedisClient.set).toHaveBeenCalledWith('test-key', 'test-value', 'PX', 100000);
    });

    it('should not set when client is disabled', async () => {
      (service as any).isClientEnabled = false;

      await service.setWithExpiration('test-key', 'test-value', 5000);

      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it('should disable client on error', async () => {
      const error = new Error('Connection failed');
      mockRedisClient.set.mockRejectedValue(error);

      const loggerSpy = jest.spyOn(Logger.prototype, 'warn');

      await service.setWithExpiration('test-key', 'test-value', 5000);

      expect((service as any).isClientEnabled).toBe(false);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Redis setWithExpiration() failed for key test-key: ${error.message}`,
      );
    });
  });

  describe('delete', () => {
    it('should delete single key', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await service.delete('test-key');

      expect(mockRedisClient.del).toHaveBeenCalledWith('test-key');
    });

    it('should delete multiple keys', async () => {
      mockRedisClient.del.mockResolvedValue(2);

      await service.delete(['key1', 'key2']);

      expect(mockRedisClient.del).toHaveBeenCalledWith('key1', 'key2');
    });

    it('should not delete when client is disabled', async () => {
      (service as any).isClientEnabled = false;

      await service.delete('test-key');

      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('should disable client on error', async () => {
      const error = new Error('Connection failed');
      mockRedisClient.del.mockRejectedValue(error);

      const loggerSpy = jest.spyOn(Logger.prototype, 'warn');

      await service.delete('test-key');

      expect((service as any).isClientEnabled).toBe(false);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Redis delete() failed for key(s): ${error.message}`,
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('should quit client successfully', async () => {
      mockRedisClient.quit.mockResolvedValue('OK');

      await service.onModuleDestroy();

      expect(mockRedisClient.quit).toHaveBeenCalled();
    });

    it('should not quit when client is disabled', async () => {
      (service as any).isClientEnabled = false;

      await service.onModuleDestroy();

      expect(mockRedisClient.quit).not.toHaveBeenCalled();
    });

    it('should force disconnect on quit error', async () => {
      const error = new Error('Quit failed');
      mockRedisClient.quit.mockRejectedValue(error);

      const loggerSpy = jest.spyOn(Logger.prototype, 'warn');

      await service.onModuleDestroy();

      expect(mockRedisClient.quit).toHaveBeenCalled();
      expect(mockRedisClient.disconnect).toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(`Redis quit() failed: ${error.message}`);
    });

    it('should handle disconnect error gracefully', async () => {
      const quitError = new Error('Quit failed');
      const disconnectError = new Error('Disconnect failed');
      mockRedisClient.quit.mockRejectedValue(quitError);
      mockRedisClient.disconnect.mockImplementation(() => {
        throw disconnectError;
      });

      const loggerSpy = jest.spyOn(Logger.prototype, 'error');

      await service.onModuleDestroy();

      expect(loggerSpy).toHaveBeenCalledWith(
        `Redis disconnect() also failed: ${disconnectError.message}`,
      );
    });
  });

  describe('event listeners', () => {
    it('should enable client on connect event', () => {
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'connect',
      )?.[1] as () => void;

      expect(connectHandler).toBeDefined();
      (service as any).isClientEnabled = false;

      connectHandler();

      expect((service as any).isClientEnabled).toBe(true);
    });

    it('should enable client on ready event', () => {
      const readyHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'ready',
      )?.[1] as () => void;

      expect(readyHandler).toBeDefined();
      (service as any).isClientEnabled = false;

      readyHandler();

      expect((service as any).isClientEnabled).toBe(true);
    });

    it('should disable client on error event', () => {
      const errorHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'error',
      )?.[1] as (err: Error) => void;

      expect(errorHandler).toBeDefined();
      (service as any).isClientEnabled = true;

      const error = new Error('Redis error');
      errorHandler(error);

      expect((service as any).isClientEnabled).toBe(false);
    });

    it('should disable client on end event', () => {
      const endHandler = mockRedisClient.on.mock.calls.find(
        (call) => call[0] === 'end',
      )?.[1] as () => void;

      expect(endHandler).toBeDefined();
      (service as any).isClientEnabled = true;

      endHandler();

      expect((service as any).isClientEnabled).toBe(false);
    });
  });

  describe('retryStrategy', () => {
    it('should return delay based on retry times', () => {
      const strategy = (service as any).retryStrategy.bind(service);
      const loggerSpy = jest.spyOn(Logger.prototype, 'debug');

      const delay1 = strategy(1);
      const delay2 = strategy(5);
      const delay3 = strategy(100);

      expect(delay1).toBe(1000);
      expect(delay2).toBe(5000);
      expect(delay3).toBe(100000); // Capped at maxRetry
      expect(loggerSpy).toHaveBeenCalled();
    });

    it('should cap delay at maxRetry', () => {
      mockConfigService.get.mockReturnValue(50000);
      const strategy = (service as any).retryStrategy.bind(service);

      const delay = strategy(1000);

      expect(delay).toBe(50000);
    });
  });

  describe('reconnectOnError', () => {
    it('should return true for READONLY errors', () => {
      const reconnect = (service as any).reconnectOnError.bind(service);
      const error = new Error('READONLY error message');
      const loggerSpy = jest.spyOn(Logger.prototype, 'error');

      const result = reconnect(error);

      expect(result).toBe(true);
      expect(loggerSpy).toHaveBeenCalledWith(
        'Redis entered READONLY mode, reconnecting...',
        error,
      );
    });

    it('should return false for other errors', () => {
      const reconnect = (service as any).reconnectOnError.bind(service);
      const error = new Error('Other error');
      const loggerSpy = jest.spyOn(Logger.prototype, 'error');

      const result = reconnect(error);

      expect(result).toBe(false);
      expect(loggerSpy).toHaveBeenCalledWith(
        'Redis error (will not trigger reconnect):',
        error.message,
      );
    });
  });
});
