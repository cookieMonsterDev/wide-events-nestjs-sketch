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
import { ResponseTraceInterceptor } from './logger/logger.Interceptor';
import { APP_GUARD, APP_PIPE, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { HttpExceptionFilter } from './http-exception.filter';

@Module({
  imports: [LoggerModule],
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
      provide: APP_INTERCEPTOR,
      useClass: ResponseTraceInterceptor,
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
