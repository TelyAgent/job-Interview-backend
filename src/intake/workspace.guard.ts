import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type Identity = { workspaceId: string; actorId: string };

@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    // A deliberate local-only identity; production remains closed until real auth is connected.
    if (this.config.get('NODE_ENV') === 'production' || this.config.get('DEV_AUTH_ENABLED') !== 'true') {
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
    }
    const request = context.switchToHttp().getRequest<{ identity: Identity }>();
    request.identity = { workspaceId: 'local-workspace', actorId: 'local-user' };
    return true;
  }
}
