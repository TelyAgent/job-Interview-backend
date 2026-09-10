import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  getHealth() {
    return {
      status: 'ok',
      service: 'hireos-interview-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
