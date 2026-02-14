import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { RedisCacheInterceptor } from './redis-cache.interceptor';
import { RedisService } from '../redis.servise';
import { RedisCache } from '../decorators/redis-cache.decorator';

describe('RedisCacheInterceptor', () => {
  let interceptor: RedisCacheInterceptor;
  let redisService: jest.Mocked<RedisService>;
  let reflector: Reflector;
  let mockExecutionContext: jest.Mocked<ExecutionContext>;
  let mockCallHandler: jest.Mocked<CallHandler>;

  beforeEach(async () => {
    const mockRedisService = {
      get: jest.fn(),
      set: jest.fn(),
      setWithExpiration: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisCacheInterceptor,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        Reflector,
      ],
    }).compile();

    interceptor = module.get<RedisCacheInterceptor>(RedisCacheInterceptor);
    redisService = module.get(RedisService);
    reflector = module.get<Reflector>(Reflector);

    // Setup mock execution context
    mockExecutionContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      getArgs: jest.fn(),
    } as any;

    // Setup mock call handler
    mockCallHandler = {
      handle: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('intercept', () => {
    it('should return next handler when no RedisCache decorator is present', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue(undefined);
      const data = { result: 'data' };
      mockCallHandler.handle.mockReturnValue(of(data));

      const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);

      expect(reflector.get).toHaveBeenCalledWith(
        RedisCache,
        mockExecutionContext.getHandler(),
      );
      expect(mockCallHandler.handle).toHaveBeenCalled();
      expect(redisService.get).not.toHaveBeenCalled();
    });

    it('should return cached data when available', async () => {
      const cachedData = JSON.stringify({ cached: 'value' });
      jest.spyOn(reflector, 'get').mockReturnValue({});
      redisService.get.mockResolvedValue(cachedData);
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({ name: 'TestController' } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);

      const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);

      expect(redisService.get).toHaveBeenCalled();
      expect(mockCallHandler.handle).not.toHaveBeenCalled();

      // Verify the observable returns cached data
      const values: any[] = [];
      result.subscribe((value) => values.push(value));
      expect(values).toEqual([{ cached: 'value' }]);
    });

    it('should call next handler when cache miss', async () => {
      const freshData = { fresh: 'data' };
      jest.spyOn(reflector, 'get').mockReturnValue({});
      redisService.get.mockResolvedValue(null);
      mockCallHandler.handle.mockReturnValue(of(freshData));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({ name: 'TestController' } as any);
      mockExecutionContext.getArgs.mockReturnValue(['arg1']);

      const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);

      expect(redisService.get).toHaveBeenCalled();
      expect(mockCallHandler.handle).toHaveBeenCalled();

      // Verify the observable returns fresh data
      const values: any[] = [];
      result.subscribe((value) => values.push(value));
      expect(values).toEqual([freshData]);
    });

    it('should generate default cache key when no key option provided', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue({});
      redisService.get.mockResolvedValue(null);
      mockCallHandler.handle.mockReturnValue(of({ data: 'test' }));
      mockExecutionContext.getHandler.mockReturnValue(function handler() {});
      mockExecutionContext.getClass.mockReturnValue({ name: 'TestController' } as any);
      mockExecutionContext.getArgs.mockReturnValue([{ id: 1 }]);

      await interceptor.intercept(mockExecutionContext, mockCallHandler);

      const cacheKey = redisService.get.mock.calls[0][0];
      expect(cacheKey).toContain('cache:TestController:handler:');
    });

    it('should use string key when provided', async () => {
      const customKey = 'custom-cache-key';
      jest.spyOn(reflector, 'get').mockReturnValue({ key: customKey });
      redisService.get.mockResolvedValue(null);
      mockCallHandler.handle.mockReturnValue(of({ data: 'test' }));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({ name: 'TestController' } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);

      await interceptor.intercept(mockExecutionContext, mockCallHandler);

      expect(redisService.get).toHaveBeenCalledWith(customKey);
    });

    it('should use function key when provided', async () => {
      const keyFunction = jest.fn().mockReturnValue('function-key');
      jest.spyOn(reflector, 'get').mockReturnValue({ key: keyFunction });
      redisService.get.mockResolvedValue(null);
      mockCallHandler.handle.mockReturnValue(of({ data: 'test' }));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({ name: 'TestController' } as any);
      const args = ['arg1', 'arg2'];
      mockExecutionContext.getArgs.mockReturnValue(args);

      await interceptor.intercept(mockExecutionContext, mockCallHandler);

      expect(keyFunction).toHaveBeenCalledWith(...args);
      expect(redisService.get).toHaveBeenCalledWith('function-key');
    });

    it('should cache result with TTL when provided', async () => {
      const ttl = 5000;
      jest.spyOn(reflector, 'get').mockReturnValue({ ttl });
      redisService.get.mockResolvedValue(null);
      const freshData = { fresh: 'data' };
      mockCallHandler.handle.mockReturnValue(of(freshData));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({ name: 'TestController' } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);

      const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);

      // Subscribe and wait for observable to complete
      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            // Wait a bit for the tap operator to execute
            setTimeout(() => {
              expect(redisService.setWithExpiration).toHaveBeenCalledWith(
                expect.any(String),
                JSON.stringify(freshData),
                ttl,
              );
              resolve();
            }, 10);
          },
        });
      });
    });

    it('should cache result without TTL when not provided', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue({});
      redisService.get.mockResolvedValue(null);
      const freshData = { fresh: 'data' };
      mockCallHandler.handle.mockReturnValue(of(freshData));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({ name: 'TestController' } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);

      const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);

      // Subscribe and wait for observable to complete
      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            // Wait a bit for the tap operator to execute
            setTimeout(() => {
              expect(redisService.set).toHaveBeenCalledWith(
                expect.any(String),
                JSON.stringify(freshData),
              );
              expect(redisService.setWithExpiration).not.toHaveBeenCalled();
              resolve();
            }, 10);
          },
        });
      });
    });

    it('should handle invalid JSON in cache gracefully', async () => {
      const invalidJson = 'invalid-json';
      jest.spyOn(reflector, 'get').mockReturnValue({});
      redisService.get.mockResolvedValue(invalidJson);
      mockCallHandler.handle.mockReturnValue(of({ data: 'test' }));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({ name: 'TestController' } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);

      const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);

      expect(mockCallHandler.handle).toHaveBeenCalled();
    });

    it('should handle complex objects in cache', async () => {
      const complexData = {
        nested: { object: { with: ['array', 'values'] } },
        date: new Date().toISOString(),
      };
      const cachedData = JSON.stringify(complexData);
      jest.spyOn(reflector, 'get').mockReturnValue({});
      redisService.get.mockResolvedValue(cachedData);
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({ name: 'TestController' } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);

      const result = await interceptor.intercept(mockExecutionContext, mockCallHandler);

      const values: any[] = [];
      result.subscribe((value) => values.push(value));
      expect(values[0]).toEqual(complexData);
    });
  });
});
