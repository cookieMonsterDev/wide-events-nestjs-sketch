import { of } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { RedisCacheService } from '../servises/redis-cache.servise';
import { RedisCacheInvalidate } from '../decorators/redis-cache-invalidate.decorator';
import { RedisCacheInvalidateInterceptor } from './redis-cache-invalidate.interceptor';

describe('RedisCacheInvalidateInterceptor', () => {
  let interceptor: RedisCacheInvalidateInterceptor;
  let redisCacheService: {
    delete: jest.MockedFunction<any>;
    deleteMany: jest.MockedFunction<any>;
    scanKeys: jest.MockedFunction<any>;
  };
  let reflector: Reflector;
  let mockExecutionContext: jest.Mocked<ExecutionContext>;
  let mockCallHandler: jest.Mocked<CallHandler>;

  beforeEach(async () => {
    const mockRedisCacheService = {
      delete: jest.fn(),
      deleteMany: jest.fn(),
      scanKeys: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisCacheInvalidateInterceptor,
        {
          provide: RedisCacheService,
          useValue: mockRedisCacheService,
        },
        Reflector,
      ],
    }).compile();

    interceptor = module.get<RedisCacheInvalidateInterceptor>(
      RedisCacheInvalidateInterceptor,
    );
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
    it('should return next handler when no RedisCacheInvalidate decorator is present', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue(undefined);
      const data = { result: 'data' };
      mockCallHandler.handle.mockReturnValue(of(data));

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      expect(reflector.get).toHaveBeenCalledWith(
        RedisCacheInvalidate,
        mockExecutionContext.getHandler(),
      );
      expect(mockCallHandler.handle).toHaveBeenCalled();
      expect(redisCacheService.delete).not.toHaveBeenCalled();
      expect(redisCacheService.scanKeys).not.toHaveBeenCalled();

      // Verify the observable returns data
      const values: any[] = [];
      result.subscribe((value) => values.push(value));
      expect(values).toEqual([data]);
    });

    it('should invalidate default exact key when no options provided', async () => {
      jest.spyOn(reflector, 'get').mockReturnValue({});
      const data = { result: 'data' };
      mockCallHandler.handle.mockReturnValue(of(data));
      mockExecutionContext.getHandler.mockReturnValue(function handler() {});
      mockExecutionContext.getClass.mockReturnValue({
        name: 'UserService',
      } as any);
      const args = ['123'];
      mockExecutionContext.getArgs.mockReturnValue(args);
      redisCacheService.delete.mockResolvedValue(undefined);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      // Subscribe and wait for observable to complete
      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              const expectedKey = `cache:UserService:handler:${JSON.stringify(args)}`;
              expect(redisCacheService.delete).toHaveBeenCalledWith(
                expectedKey,
              );
              expect(redisCacheService.scanKeys).not.toHaveBeenCalled();
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
      mockExecutionContext.getClass.mockReturnValue({
        name: 'UserService',
      } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);
      redisCacheService.scanKeys.mockResolvedValue(matchingKeys);
      redisCacheService.deleteMany.mockResolvedValue(undefined);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              expect(redisCacheService.scanKeys).toHaveBeenCalledWith(pattern);
              expect(redisCacheService.deleteMany).toHaveBeenCalledWith(
                matchingKeys,
              );
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
      mockExecutionContext.getClass.mockReturnValue({
        name: 'UserService',
      } as any);
      mockExecutionContext.getArgs.mockReturnValue(args);
      redisCacheService.scanKeys.mockResolvedValue(matchingKeys);
      redisCacheService.deleteMany.mockResolvedValue(undefined);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              expect(patternFunction).toHaveBeenCalledWith(...args);
              expect(redisCacheService.scanKeys).toHaveBeenCalledWith(
                'cache:UserService:getUser:*',
              );
              expect(redisCacheService.deleteMany).toHaveBeenCalledWith(
                matchingKeys,
              );
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
      mockExecutionContext.getClass.mockReturnValue({
        name: 'UserService',
      } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);
      redisCacheService.scanKeys.mockResolvedValue([]);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              expect(redisCacheService.scanKeys).toHaveBeenCalledWith(pattern);
              expect(redisCacheService.delete).not.toHaveBeenCalled();
              expect(redisCacheService.deleteMany).not.toHaveBeenCalled();
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
      redisCacheService.delete.mockResolvedValue(undefined);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              const expectedKey = `cache:TestController:handler:${JSON.stringify(args)}`;
              expect(redisCacheService.delete).toHaveBeenCalledWith(
                expectedKey,
              );
              expect(redisCacheService.scanKeys).not.toHaveBeenCalled();
              resolve();
            }, 10);
          },
        });
      });
    });

    it('should use pattern when provided', async () => {
      const pattern = 'cache:UserService:*';
      const matchingKeys = ['cache:UserService:getUser:["123"]'];
      jest.spyOn(reflector, 'get').mockReturnValue({ pattern });
      const data = { result: 'data' };
      mockCallHandler.handle.mockReturnValue(of(data));
      mockExecutionContext.getHandler.mockReturnValue(() => {});
      mockExecutionContext.getClass.mockReturnValue({
        name: 'UserService',
      } as any);
      mockExecutionContext.getArgs.mockReturnValue([]);
      redisCacheService.scanKeys.mockResolvedValue(matchingKeys);
      redisCacheService.deleteMany.mockResolvedValue(undefined);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              expect(redisCacheService.scanKeys).toHaveBeenCalledWith(pattern);
              expect(redisCacheService.deleteMany).toHaveBeenCalledWith(
                matchingKeys,
              );
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
      redisCacheService.delete.mockResolvedValue(undefined);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              const expectedKey = `cache:TestController:handler:[]`;
              expect(redisCacheService.delete).toHaveBeenCalledWith(
                expectedKey,
              );
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
      redisCacheService.delete.mockResolvedValue(undefined);

      const result = await interceptor.intercept(
        mockExecutionContext,
        mockCallHandler,
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          complete: () => {
            setTimeout(() => {
              const expectedKey = `cache:TestController:handler:${JSON.stringify(args)}`;
              expect(redisCacheService.delete).toHaveBeenCalledWith(
                expectedKey,
              );
              resolve();
            }, 10);
          },
        });
      });
    });
  });
});
