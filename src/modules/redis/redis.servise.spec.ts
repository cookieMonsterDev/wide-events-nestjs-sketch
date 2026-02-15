import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.servise';
import { Test, TestingModule } from '@nestjs/testing';

// Mock Logger to suppress console output during tests
jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});

// Mock ioredis
const mockRedisClientMethods = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  quit: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn(),
};

jest.mock('ioredis', () => {
  const MockRedis = jest.fn().mockImplementation(() => {
    return mockRedisClientMethods;
  });

  return {
    Redis: MockRedis,
    default: MockRedis,
  };
});

describe('RedisService', () => {
  let service: RedisService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Reset mock functions
    mockRedisClientMethods.get.mockClear();
    mockRedisClientMethods.set.mockClear();
    mockRedisClientMethods.del.mockClear();
    mockRedisClientMethods.keys.mockClear();
    mockRedisClientMethods.quit.mockClear();
    mockRedisClientMethods.disconnect.mockClear();
    mockRedisClientMethods.on.mockClear();

    mockConfigService.get.mockImplementation(
      (key: string, defaultValue?: any) => {
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
      },
    );

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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create Redis client with correct options', () => {
      const Redis = require('ioredis').Redis;
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
      const onCalls = mockRedisClientMethods.on.mock.calls;
      const eventNames = onCalls.map((call) => call[0]);
      expect(eventNames).toContain('connect');
      expect(eventNames).toContain('ready');
      expect(eventNames).toContain('error');
      expect(eventNames).toContain('end');
    });
  });

  describe('client proxy', () => {
    it('should return value when key exists', async () => {
      const value = 'test-value';
      mockRedisClientMethods.get.mockResolvedValue(value);

      const result = await service.client.get('test-key');

      expect(result).toBe(value);
      expect(mockRedisClientMethods.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null when key does not exist', async () => {
      mockRedisClientMethods.get.mockResolvedValue(null);

      const result = await service.client.get('test-key');

      expect(result).toBe(null);
      expect(mockRedisClientMethods.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null and log error on client error', async () => {
      const error = new Error('Connection failed');
      mockRedisClientMethods.get.mockRejectedValue(error);

      const loggerSpy = jest.spyOn(Logger.prototype, 'error');

      const result = await service.client.get('test-key');

      expect(result).toBe(null);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Redis error on method [get]: ${error.message}`,
      );
    });
  });

  describe('client methods', () => {
    it('should set value successfully', async () => {
      mockRedisClientMethods.set.mockResolvedValue('OK');

      const result = await service.client.set('test-key', 'test-value');

      expect(result).toBe('OK');
      expect(mockRedisClientMethods.set).toHaveBeenCalledWith(
        'test-key',
        'test-value',
      );
    });

    it('should return null and log error on set error', async () => {
      const error = new Error('Connection failed');
      mockRedisClientMethods.set.mockRejectedValue(error);

      const loggerSpy = jest.spyOn(Logger.prototype, 'error');

      const result = await service.client.set('test-key', 'test-value');

      expect(result).toBe(null);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Redis error on method [set]: ${error.message}`,
      );
    });

    it('should handle different value types', async () => {
      mockRedisClientMethods.set.mockResolvedValue('OK');

      await service.client.set('key1', 'string');
      await service.client.set('key2', 123);
      await service.client.set('key3', Buffer.from('buffer'));

      expect(mockRedisClientMethods.set).toHaveBeenCalledWith('key1', 'string');
      expect(mockRedisClientMethods.set).toHaveBeenCalledWith('key2', 123);
      expect(mockRedisClientMethods.set).toHaveBeenCalledWith(
        'key3',
        expect.any(Buffer),
      );
      expect(mockRedisClientMethods.set).toHaveBeenCalledTimes(3);
    });

    it('should delete single key', async () => {
      mockRedisClientMethods.del.mockResolvedValue(1);

      const result = await service.client.del('test-key');

      expect(result).toBe(1);
      expect(mockRedisClientMethods.del).toHaveBeenCalledWith('test-key');
    });

    it('should delete multiple keys', async () => {
      mockRedisClientMethods.del.mockResolvedValue(2);

      const result = await service.client.del('key1', 'key2');

      expect(result).toBe(2);
      expect(mockRedisClientMethods.del).toHaveBeenCalledWith('key1', 'key2');
    });

    it('should return null and log error on del error', async () => {
      const error = new Error('Connection failed');
      mockRedisClientMethods.del.mockRejectedValue(error);

      const loggerSpy = jest.spyOn(Logger.prototype, 'error');

      const result = await service.client.del('test-key');

      expect(result).toBe(null);
      expect(loggerSpy).toHaveBeenCalledWith(
        `Redis error on method [del]: ${error.message}`,
      );
    });
  });

  describe('event listeners', () => {
    it('should log on connect event', () => {
      const connectHandler = mockRedisClientMethods.on.mock.calls.find(
        (call) => call[0] === 'connect',
      )?.[1] as () => void;

      expect(connectHandler).toBeDefined();
      const loggerSpy = jest.spyOn(Logger.prototype, 'log');

      connectHandler();

      expect(loggerSpy).toHaveBeenCalledWith('Redis connected');
    });

    it('should log on ready event', () => {
      const readyHandler = mockRedisClientMethods.on.mock.calls.find(
        (call) => call[0] === 'ready',
      )?.[1] as () => void;

      expect(readyHandler).toBeDefined();
      const loggerSpy = jest.spyOn(Logger.prototype, 'log');

      readyHandler();

      expect(loggerSpy).toHaveBeenCalledWith('Redis ready');
    });

    it('should log warning on error event', () => {
      const errorHandler = mockRedisClientMethods.on.mock.calls.find(
        (call) => call[0] === 'error',
      )?.[1] as (err: Error) => void;

      expect(errorHandler).toBeDefined();
      const loggerSpy = jest.spyOn(Logger.prototype, 'warn');

      const error = new Error('Redis error');
      errorHandler(error);

      expect(loggerSpy).toHaveBeenCalledWith(`Redis error: ${error.message}`);
    });

    it('should log warning on end event', () => {
      const endHandler = mockRedisClientMethods.on.mock.calls.find(
        (call) => call[0] === 'end',
      )?.[1] as () => void;

      expect(endHandler).toBeDefined();
      const loggerSpy = jest.spyOn(Logger.prototype, 'warn');

      endHandler();

      expect(loggerSpy).toHaveBeenCalledWith('Redis connection ended');
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
