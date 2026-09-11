import { Controller, Header, Post, UseGuards } from '@nestjs/common';
import { WorkspaceGuard } from '../intake/workspace.guard';
import { MeetingsService } from './meetings.service';

@Controller('meetings/dev')
@UseGuards(WorkspaceGuard)
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Post('join-config')
  @Header('Cache-Control', 'no-store')
  join() { return this.meetings.joinConfig(); }
}
