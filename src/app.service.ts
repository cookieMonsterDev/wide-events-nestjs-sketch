import { REQUEST } from '@nestjs/core';
import { type Request } from 'express';
import { Log } from './logger/decorators/log.decorator';
import { Inject, Injectable, NotFoundException, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST })
export class AppService {
  constructor(@Inject(REQUEST) private readonly request: Request) {}

  getHello(): string {
    this.getRandomMinMax();

    return 'Hello World!';
  }

  getError(): string {
    this.getRandomMinMax();

    throw new NotFoundException('This is a test error');
  }

  @Log()
  private getRandomMinMax() {
    return {
      min: Math.floor(Math.random() * 100),
      max: Math.floor(Math.random() * 100) + 100,
    };
  }
}
