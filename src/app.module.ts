import {
  Module,
  NestModule,
  RequestMethod,
  ValidationPipe,
  MiddlewareConsumer,
} from '@nestjs/common';
import { AppService } from './app.service';
import { AuthGuard } from './common/auth.guard';
import { AppController } from './app.controller';
import { LoggerModule } from './logger/logger.module';
import { RequestTraceMiddleware } from './logger/logger.middleware';
import { APP_GUARD, APP_PIPE, APP_FILTER } from '@nestjs/core';

import { RedisModule } from './modules/redis/redis.module';

import { HttpExceptionFilter } from './http-exception.filter';

@Module({
  imports: [LoggerModule, RedisModule],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestTraceMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
