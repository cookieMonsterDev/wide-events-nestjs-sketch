import {
  Catch,
  ArgumentsHost,
  HttpException,
  ExceptionFilter,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LoggerService } from './logger/logger.service';
import { ResponseLogDto } from './logger/dto/response-log.dto';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const body = exception.getResponse();
    const statusCode = exception.getStatus();

    const headers = { ...response.getHeaders() };

    request.scope.response = {
      statusCode,
      headers,
      body,
    } satisfies ResponseLogDto;

    this.logger.logWideEvent(request.scope);

    response.status(statusCode).json(body);
  }
}
