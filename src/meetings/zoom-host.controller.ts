import { Controller, ForbiddenException, Get, Header, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { WorkspaceGuard, type Identity } from '../intake/workspace.guard';
import { ZoomHostService } from './zoom-host.service';

@Controller('meetings/host')
@UseGuards(WorkspaceGuard)
export class ZoomHostController {
  constructor(private readonly zoom: ZoomHostService) {}
  private mutation(header?: string) {
    // Custom header prevents cross-site form submissions to the local development API.
    if (header !== '1') throw new ForbiddenException({ code: 'ZOOM_REQUEST_REJECTED' });
  }
  @Get('status')
  @Header('Cache-Control', 'no-store')
  status(@Req() req: { identity: Identity }) { return this.zoom.status(req.identity); }
  @Post('authorize')
  @Header('Cache-Control', 'no-store')
  authorize(@Req() req: { identity: Identity }, @Headers('x-hireos-zoom') header?: string) { this.mutation(header); return this.zoom.authorize(req.identity); }
  @Post('start')
  @Header('Cache-Control', 'no-store')
  start(@Req() req: { identity: Identity }, @Headers('x-hireos-zoom') header?: string) { this.mutation(header); return this.zoom.start(req.identity); }
  @Post('reset-meeting')
  @Header('Cache-Control', 'no-store')
  reset(@Req() req: { identity: Identity }, @Headers('x-hireos-zoom') header?: string) { this.mutation(header); return this.zoom.resetMeeting(req.identity); }
}
