import { RequestLogDto } from './logger/dto/request-log.dto';
import { ResponseLogDto } from './logger/dto/response-log.dto';

declare global {
  namespace Express {
    interface Request {
      scope: {
        request?: RequestLogDto;
        response?: ResponseLogDto;
      } & Record<string, any>;
    }
  }
}

export {};
