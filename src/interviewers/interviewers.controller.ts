import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { WorkspaceGuard, type Identity } from '../intake/workspace.guard';
import { InterviewersService } from './interviewers.service';

@Controller()
@UseGuards(WorkspaceGuard)
export class InterviewersController {
  constructor(private readonly interviewers: InterviewersService) {}
  @Get('interviewers')
  list(@Req() req: { identity: Identity }) {
    return this.interviewers.list(req.identity.workspaceId);
  }
}
