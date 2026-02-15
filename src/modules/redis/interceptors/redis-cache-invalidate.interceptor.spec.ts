import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { RedisCacheInvalidateInterceptor } from './redis-cache-invalidate.interceptor';
import { RedisService } from '../redis.servise';
import { InvalidateCache } from '../decorators/invalidate-cache.decorator';

describe('RedisCacheInvalidateInterceptor', () => {
  let interceptor: RedisCacheInvalidateInterceptor;
  let redisService: jest.Mocked<RedisService>;
  let reflector: Reflector;
  let mockExecutionContext: jest.Mocked<ExecutionContext>;
  let mockCallHandler: jest.Mocked<CallHandler>;

  beforeEach(async () => {
    const mockRedisService = {
      del: jest.fn(),
      keys: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisCacheInvalidateInterceptor,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        Reflector,
      ],
    }).compile();

    interceptor = module.get<RedisCacheInvalidateInterceptor>(
      RedisCacheInvalidateInterceptor,
    );
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
    it('should return next handler when no InvalidateCache decorator is present', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue(undefined);
      const data = { result: 'data' };
      mockCallHandler.handle.mockReturnValue(of(data));

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      expect(reflector.get).toHaveBeenCalledWith(
        InvalidateCache,
        mockExecutionContext.getHandler(),
      );
      expect(mockCallHandler.handle).toHaveBeenCalled();
      expect(redisService.del).not.toHaveBeenCalled();
      expect(redisService.keys).not.toHaveBeenCalled();

      // Verify the observable returns data
      const values: any[] = [];
      result.subscribe((value) => values.push(value));
      expect(values).toEqual([data]);
    });

    it('should invalidate cache with string key', async () => {
      const key = 'cache:UserService:getUser:["123"]';
      jest.spyOn(reflector, 'get').mockReturnValue({ keys: key });
      const data = { result: 'data' };
      mockCallHandler.handle.mockReturnValue(of(data));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({ name: 'UserService' } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);
      redisService.del.mockResolvedValue(undefined);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Subscribe and wait for observable to complete
      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              expect(redisService.del).toHaveBeenCalledWith(key);
              expect(redisService.keys).not.toHaveBeenCalled();
              resolve();
            }, 10);
          },
        });
      });
    });

    it('should invalidate cache with array of keys', async () => {
      const keys = [
        'cache:UserService:getUser:["123"]',
        'cache:UserService:getUser:["456"]',
      ];
      jest.spyOn(reflector, 'get').mockReturnValue({ keys });
      const data = { result: 'data' };
      mockCallHandler.handle.mockReturnValue(of(data));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({ name: 'UserService' } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);
      redisService.del.mockResolvedValue(undefined);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              expect(redisService.del).toHaveBeenCalledWith(keys);
              expect(redisService.keys).not.toHaveBeenCalled();
              resolve();
            }, 10);
          },
        });
      });
    });

    it('should invalidate cache with function key', async () => {
      const keyFunction = jest
        .fn()
        .mockReturnValue('cache:UserService:getUser:["123"]');
      jest.spyOn(reflector, 'get').mockReturnValue({ keys: keyFunction });
      const data = { result: 'data' };
      mockCallHandler.handle.mockReturnValue(of(data));
      const args = ['123'];
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({ name: 'UserService' } as any);
      mockExecutionContext.getArgs.mockReturnValue(args);
      redisService.del.mockResolvedValue(undefined);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              expect(keyFunction).toHaveBeenCalledWith(...args);
              expect(redisService.del).toHaveBeenCalledWith(
                'cache:UserService:getUser:["123"]',
              );
              resolve();
            }, 10);
          },
        });
      });
    });

    it('should invalidate cache with function key returning array', async () => {
      const keys = [
        'cache:UserService:getUser:["123"]',
        'cache:UserService:getUser:["456"]',
      ];
      const keyFunction = jest.fn().mockReturnValue(keys);
      jest.spyOn(reflector, 'get').mockReturnValue({ keys: keyFunction });
      const data = { result: 'data' };
      mockCallHandler.handle.mockReturnValue(of(data));
      const args = ['123', '456'];
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({ name: 'UserService' } as any);
      mockExecutionContext.getArgs.mockReturnValue(args);
      redisService.del.mockResolvedValue(undefined);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              expect(keyFunction).toHaveBeenCalledWith(...args);
              expect(redisService.del).toHaveBeenCalledWith(keys);
              resolve();
            }, 10);
          },
        });
      });
    });

    it('should invalidate cache with string pattern', async () => {
      const pattern = 'cache:UserService:getUser:*';
      const matchingKeys = [
        'cache:UserService:getUser:["123"]',
        'cache:UserService:getUser:["456"]',
      ];
      jest.spyOn(reflector, 'get').mockReturnValue({ pattern });
      const data = { result: 'data' };
      mockCallHandler.handle.mockReturnValue(of(data));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({ name: 'UserService' } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);
      redisService.keys.mockResolvedValue(matchingKeys);
      redisService.del.mockResolvedValue(undefined);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              expect(redisService.keys).toHaveBeenCalledWith(pattern);
              expect(redisService.del).toHaveBeenCalledWith(matchingKeys);
              resolve();
            }, 10);
          },
        });
      });
    });

    it('should invalidate cache with function pattern', async () => {
      const patternFunction = jest
        .fn()
        .mockReturnValue('cache:UserService:getUser:*');
      const matchingKeys = ['cache:UserService:getUser:["123"]'];
      jest
        .spyOn(reflector, 'get')
        .mockReturnValue({ pattern: patternFunction });
      const data = { result: 'data' };
      mockCallHandler.handle.mockReturnValue(of(data));
      const args = ['123'];
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({ name: 'UserService' } as any);
      mockExecutionContext.getArgs.mockReturnValue(args);
      redisService.keys.mockResolvedValue(matchingKeys);
      redisService.del.mockResolvedValue(undefined);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              expect(patternFunction).toHaveBeenCalledWith(...args);
              expect(redisService.keys).toHaveBeenCalledWith(
                'cache:UserService:getUser:*',
              );
              expect(redisService.del).toHaveBeenCalledWith(matchingKeys);
              resolve();
            }, 10);
          },
        });
      });
    });

    it('should not call del when pattern matches no keys', async () => {
      const pattern = 'cache:UserService:getUser:*';
      jest.spyOn(reflector, 'get').mockReturnValue({ pattern });
      const data = { result: 'data' };
      mockCallHandler.handle.mockReturnValue(of(data));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({ name: 'UserService' } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);
      redisService.keys.mockResolvedValue([]);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              expect(redisService.keys).toHaveBeenCalledWith(pattern);
              expect(redisService.del).not.toHaveBeenCalled();
              resolve();
            }, 10);
          },
        });
      });
    });

    it('should invalidate default exact key when no options provided', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue({});
      const data = { result: 'data' };
      mockCallHandler.handle.mockReturnValue(of(data));
      mockExecutionContext.getHandler.mockReturnValue(function handler() {});
      mockExecutionContext.getClass.mockReturnValue({
        name: 'TestController',
      } as any);
      const args = [{ id: '123' }];
      mockExecutionContext.getArgs.mockReturnValue(args);
      redisService.del.mockResolvedValue(undefined);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              const expectedKey = `cache:TestController:handler:${JSON.stringify(args)}`;
              expect(redisService.del).toHaveBeenCalledWith(expectedKey);
              expect(redisService.keys).not.toHaveBeenCalled();
              resolve();
            }, 10);
          },
        });
      });
    });

    it('should prioritize keys option over pattern option', async () => {
      const key = 'cache:UserService:getUser:["123"]';
      jest
        .spyOn(reflector, 'get')
        .mockReturnValue({ keys: key, pattern: 'cache:UserService:*' });
      const data = { result: 'data' };
      mockCallHandler.handle.mockReturnValue(of(data));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({ name: 'UserService' } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);
      redisService.del.mockResolvedValue(undefined);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              expect(redisService.del).toHaveBeenCalledWith(key);
              expect(redisService.keys).not.toHaveBeenCalled();
              resolve();
            }, 10);
          },
        });
      });
    });

    it('should handle empty args array', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue({});
      const data = { result: 'data' };
      mockCallHandler.handle.mockReturnValue(of(data));
      mockExecutionContext.getHandler.mockReturnValue(function handler() {});
      mockExecutionContext.getClass.mockReturnValue({
        name: 'TestController',
      } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);
      redisService.del.mockResolvedValue(undefined);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              const expectedKey = `cache:TestController:handler:[]`;
              expect(redisService.del).toHaveBeenCalledWith(expectedKey);
              resolve();
            }, 10);
          },
        });
      });
    });

    it('should handle complex args in default key generation', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue({});
      const data = { result: 'data' };
      mockCallHandler.handle.mockReturnValue(of(data));
      mockExecutionContext.getHandler.mockReturnValue(function handler() {});
      mockExecutionContext.getClass.mockReturnValue({
        name: 'TestController',
      } as any);
      const args = [
        { id: '123', nested: { value: 'test' } },
        ['array', 'values'],
      ];
      mockExecutionContext.getArgs.mockReturnValue(args);
      redisService.del.mockResolvedValue(undefined);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              const expectedKey = `cache:TestController:handler:${JSON.stringify(args)}`;
              expect(redisService.del).toHaveBeenCalledWith(expectedKey);
              resolve();
            }, 10);
          },
        });
      });
    });
  });
});
