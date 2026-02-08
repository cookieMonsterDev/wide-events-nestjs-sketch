import { OutgoingHttpHeaders } from 'http';

export class ResponseLogDto {
  statusCode: number;
  headers: OutgoingHttpHeaders;
  body: any;
}
