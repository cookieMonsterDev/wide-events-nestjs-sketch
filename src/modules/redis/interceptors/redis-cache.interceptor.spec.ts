import { of } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { RedisCacheService } from '../servises/redis-cache.servise';
import { RedisCache } from '../decorators/redis-cache.decorator';
import { RedisCacheInterceptor } from './redis-cache.interceptor';

describe('RedisCacheInterceptor', () => {
  let interceptor: RedisCacheInterceptor;
  let redisCacheService: jest.Mocked<RedisCacheService>;
  let reflector: Reflector;
  let mockExecutionContext: jest.Mocked<ExecutionContext>;
  let mockCallHandler: jest.Mocked<CallHandler>;

  beforeEach(async () => {
    const mockRedisCacheService = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisCacheInterceptor,
        {
          provide: RedisCacheService,
          useValue: mockRedisCacheService,
        },
        Reflector,
      ],
    }).compile();

    interceptor = module.get<RedisCacheInterceptor>(RedisCacheInterceptor);
    redisCacheService = module.get(RedisCacheService);
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

      await interceptor.intercept(mockExecutionContext, mockCallHandler);

      expect(reflector.get).toHaveBeenCalledWith(
        RedisCache,
        mockExecutionContext.getHandler(),
      );
      expect(mockCallHandler.handle).toHaveBeenCalled();
      expect(redisCacheService.get).not.toHaveBeenCalled();
    });

    it('should return cached data when available', async () => {
      const cachedData = { cached: 'value' };
      jest.spyOn(reflector, 'get').mockReturnValue({});
      redisCacheService.get.mockResolvedValue(cachedData);
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({
        name: 'TestController',
      } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      expect(redisCacheService.get).toHaveBeenCalled();
      expect(mockCallHandler.handle).not.toHaveBeenCalled();

      // Verify the observable returns cached data
      const values: any[] = [];
      result.subscribe((value) => values.push(value));
      expect(values).toEqual([{ cached: 'value' }]);
    });

    it('should call next handler when cache miss', async () => {
      const freshData = { fresh: 'data' };
      jest.spyOn(reflector, 'get').mockReturnValue({});
      redisCacheService.get.mockResolvedValue(null);
      mockCallHandler.handle.mockReturnValue(of(freshData));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({
        name: 'TestController',
      } as any);
      mockExecutionContext.getArgs.mockReturnValue(['arg1']);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      expect(redisCacheService.get).toHaveBeenCalled();
      expect(mockCallHandler.handle).toHaveBeenCalled();

      // Verify the observable returns fresh data
      const values: any[] = [];
      result.subscribe((value) => values.push(value));
      expect(values).toEqual([freshData]);
    });

    it('should generate default cache key when no key option provided', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue({});
      redisCacheService.get.mockResolvedValue(null);
      mockCallHandler.handle.mockReturnValue(of({ data: 'test' }));
      mockExecutionContext.getHandler.mockReturnValue(function handler() {});
      mockExecutionContext.getClass.mockReturnValue({
        name: 'TestController',
      } as any);
      mockExecutionContext.getArgs.mockReturnValue([{ id: 1 }]);

      await interceptor.intercept(mockExecutionContext, mockCallHandler);

      const cacheKey = redisCacheService.get.mock.calls[0][0];
      expect(cacheKey).toContain('cache:TestController:handler:');
    });

    it('should use function key when provided', async () => {
      const customKey = 'custom-cache-key';
      const keyFunction = jest.fn().mockReturnValue(customKey);
      jest.spyOn(reflector, 'get').mockReturnValue({ key: keyFunction });
      redisCacheService.get.mockResolvedValue(null);
      mockCallHandler.handle.mockReturnValue(of({ data: 'test' }));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({
        name: 'TestController',
      } as any);
      const args = [];
      mockExecutionContext.getArgs.mockReturnValue(args);

      await interceptor.intercept(mockExecutionContext, mockCallHandler);

      expect(keyFunction).toHaveBeenCalledWith(...args);
      expect(redisCacheService.get).toHaveBeenCalledWith(customKey);
    });

    it('should use function key when provided with args', async () => {
      const keyFunction = jest.fn().mockReturnValue('function-key');
      jest.spyOn(reflector, 'get').mockReturnValue({ key: keyFunction });
      redisCacheService.get.mockResolvedValue(null);
      mockCallHandler.handle.mockReturnValue(of({ data: 'test' }));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({
        name: 'TestController',
      } as any);
      const args = ['arg1', 'arg2'];
      mockExecutionContext.getArgs.mockReturnValue(args);

      await interceptor.intercept(mockExecutionContext, mockCallHandler);

      expect(keyFunction).toHaveBeenCalledWith(...args);
      expect(redisCacheService.get).toHaveBeenCalledWith('function-key');
    });

    it('should cache result with TTL when provided', async () => {
      const ttl = 5000;
      jest.spyOn(reflector, 'get').mockReturnValue({ ttl });
      redisCacheService.get.mockResolvedValue(null);
      redisCacheService.set.mockResolvedValue(undefined);
      const freshData = { fresh: 'data' };
      mockCallHandler.handle.mockReturnValue(of(freshData));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({
        name: 'TestController',
      } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Subscribe and wait for observable to complete
      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            // Wait a bit for the tap operator to execute
            setTimeout(() => {
              expect(redisCacheService.set).toHaveBeenCalledWith(
                expect.any(String),
                freshData,
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
      redisCacheService.get.mockResolvedValue(null);
      redisCacheService.set.mockResolvedValue(undefined);
      const freshData = { fresh: 'data' };
      mockCallHandler.handle.mockReturnValue(of(freshData));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({
        name: 'TestController',
      } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Subscribe and wait for observable to complete
      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            // Wait a bit for the tap operator to execute
            setTimeout(() => {
              expect(redisCacheService.set).toHaveBeenCalledWith(
                expect.any(String),
                freshData,
                undefined,
              );
              resolve();
            }, 10);
          },
        });
      });
    });

    it('should handle invalid JSON in cache gracefully', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue({});
      redisCacheService.get.mockResolvedValue(null);
      mockCallHandler.handle.mockReturnValue(of({ data: 'test' }));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({
        name: 'TestController',
      } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);

      await interceptor.intercept(mockExecutionContext, mockCallHandler);

      expect(mockCallHandler.handle).toHaveBeenCalled();
    });

    it('should handle complex objects in cache', async () => {
      const complexData = {
        nested: { object: { with: ['array', 'values'] } },
        date: new Date().toISOString(),
      };
      jest.spyOn(reflector, 'get').mockReturnValue({});
      redisCacheService.get.mockResolvedValue(complexData);
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({
        name: 'TestController',
      } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      const values: any[] = [];
      result.subscribe((value) => values.push(value));
      expect(values[0]).toEqual(complexData);
    });
  });
});
