import { RequestLogDto } from './dto/request-log.dto';
import { Request, Response, NextFunction } from 'express';
import { Injectable, NestMiddleware } from '@nestjs/common';
import { LoggerService } from './logger.service';
import { ResponseLogDto } from './dto/response-log.dto';

@Injectable()
export class RequestTraceMiddleware implements NestMiddleware {
  constructor(private readonly logger: LoggerService) {}

  use(request: Request, response: Response, next: NextFunction) {
    if (!request.scope) request.scope = {};

    request.scope.request = {
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
    } satisfies RequestLogDto;

    response.on('finish', () => {
      console.log(`[MIDDLEWARE] ${response.statusCode}`);

      console.log(response)

      const body = response['body'];
      const statusCode = response.statusCode;

      const headers = { ...response.getHeaders() };

      request.scope.response = {
        statusCode,
        headers,
        body,
      } satisfies ResponseLogDto;

      this.logger.logWideEvent(request.scope);
    });

    next();
  }
}
