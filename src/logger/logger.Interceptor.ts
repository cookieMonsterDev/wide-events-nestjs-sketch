import {
  Injectable,
  CallHandler,
  NestInterceptor,
  ExecutionContext,
} from '@nestjs/common';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { ResponseLogDto } from './dto/response-log.dto';
import { LoggerService } from './logger.service';

@Injectable()
export class ResponseTraceInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      tap((data) => {
        const request = context.switchToHttp().getRequest<Request>();
        const response = context.switchToHttp().getResponse<Response>();

        const headers = { ...response.getHeaders() };

        request.scope.response = {
          statusCode: response.statusCode,
          headers,
          body: data,
        } satisfies ResponseLogDto;

        this.logger.logWideEvent(request.scope);
      }),
    );
  }
}
