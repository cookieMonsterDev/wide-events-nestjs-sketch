import { AppService } from './app.service';
import { Controller, Get, Scope } from '@nestjs/common';

@Controller({ scope: Scope.REQUEST })
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('')
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('error')
  getError() {
    return this.appService.getError();
  }
}
