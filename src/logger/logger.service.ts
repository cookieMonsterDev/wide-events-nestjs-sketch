import { Request } from 'express';
import { Injectable } from '@nestjs/common';

@Injectable()
export class LoggerService {
  async logWideEvent(scope: Request['scope']) {
    console.log('====================LOG SCOPE IN CONSOLE====================');
    // just to show that we can access the scope in any part of the app, maybe we can send this to a log management system like ELK stack or any other log management system
    console.log(scope);
  }

  async broadcastWideEvent(scope: Request['scope']) {
    console.log('=======================BORODCAST=======================');
    /// maybe send via rabbitmq or redis pub/sub or any other message broker
    console.log(scope);
  }
}
