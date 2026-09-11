import { Body, Controller, ForbiddenException, Get, Header, Headers, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { WorkspaceGuard, type Identity } from '../intake/workspace.guard';
import { MeetingRecordsService } from './meeting-records.service';

@Controller()
@UseGuards(WorkspaceGuard)
export class MeetingRecordsController {
  constructor(private readonly records: MeetingRecordsService) {}
  private mutation(header: string) { if (header !== '1') throw new ForbiddenException({ code: 'RECORD_REQUEST_REQUIRED' }); }

  @Get('meeting-record-projects')
  @Header('Cache-Control', 'no-store')
  projects(@Req() req: { identity: Identity }) { return this.records.projects(req.identity); }

  @Post('projects/:id/interview-sessions')
  @Header('Cache-Control', 'no-store')
  create(@Req() req: { identity: Identity }, @Param('id') id: string, @Headers('x-hireos-record') header: string, @Body() body: unknown) {
    this.mutation(header); return this.records.create(req.identity, id, body);
  }

  @Get('interview-sessions/:id/record')
  @Header('Cache-Control', 'no-store')
  get(@Req() req: { identity: Identity }, @Param('id') id: string) { return this.records.get(req.identity, id); }

  @Put('interview-sessions/:id/record/notes/me')
  @Header('Cache-Control', 'no-store')
  save(@Req() req: { identity: Identity }, @Param('id') id: string, @Headers('x-hireos-record') header: string, @Body() body: unknown) {
    this.mutation(header); return this.records.save(req.identity, id, body);
  }
}
