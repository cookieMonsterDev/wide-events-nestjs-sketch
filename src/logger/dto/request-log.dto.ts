import { IncomingHttpHeaders } from "http";

export class RequestLogDto {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: any;
}
