import { HttpException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

@Injectable()
export class MeetingsService {
  private issued: number[] = [];
  constructor(private readonly config: ConfigService) {}

  joinConfig() {
    if (this.config.get('NODE_ENV') === 'production' || this.config.get('ZOOM_DEV_ENABLED') !== 'true') {
      throw new NotFoundException({ code: 'ZOOM_DISABLED' });
    }
    const clientId = this.config.get<string>('ZOOM_MEETING_SDK_CLIENT_ID');
    const secret = this.config.get<string>('ZOOM_MEETING_SDK_CLIENT_SECRET');
    const meetingNumber = this.config.get<string>('ZOOM_DEV_MEETING_NUMBER');
    const password = this.config.get<string>('ZOOM_DEV_MEETING_PASSWORD');
    if (!clientId || !secret || !meetingNumber || !/^\d{9,11}$/.test(meetingNumber) || !password) {
      throw new ServiceUnavailableException({ code: 'ZOOM_NOT_CONFIGURED' });
    }
    return this.sign(meetingNumber, password, 'HireOS Interviewer', 0);
  }

  hostConfig(meetingNumber: string, password: string, displayName: string) {
    return this.sign(meetingNumber, password, displayName, 1);
  }

  private sign(meetingNumber: string, password: string, displayName: string, role: 0 | 1) {
    const clientId = this.config.get<string>('ZOOM_MEETING_SDK_CLIENT_ID');
    const secret = this.config.get<string>('ZOOM_MEETING_SDK_CLIENT_SECRET');
    if (!clientId || !secret) throw new ServiceUnavailableException({ code: 'ZOOM_NOT_CONFIGURED' });
    const now = Math.floor(Date.now() / 1000);
    this.issued = this.issued.filter(time => time > now - 60);
    if (this.issued.length >= 10) throw new HttpException({ code: 'ZOOM_RATE_LIMITED' }, 429);
    this.issued.push(now);
    const iat = now - 30;
    const exp = now + 1800;
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const payload = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ appKey: clientId, mn: meetingNumber, role, iat, exp, tokenExp: exp })}`;
    const signature = `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
    return { meetingNumber, password, displayName, signature, expiresAt: exp };
  }
}
