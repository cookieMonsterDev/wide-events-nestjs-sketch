import { Request } from 'express';
import { CanActivate, ExecutionContext } from '@nestjs/common';

export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    await new Promise((res) => setTimeout(res, 100));

    const auth = { userId: Math.floor(Math.random() * 100), role: 'user' };

    request.scope.auth = auth;

    return true;
  }
}
