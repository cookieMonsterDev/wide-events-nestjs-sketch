import { RequestLogDto } from './dto/request-log.dto';
import { Request, Response, NextFunction } from 'express';
import { Injectable, NestMiddleware } from '@nestjs/common';

@Injectable()
export class RequestTraceMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction) {
    if (!request.scope) request.scope = {};

    request.scope.request = {
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
    } satisfies RequestLogDto;

    next();
  }
}
