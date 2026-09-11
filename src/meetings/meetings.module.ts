import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { WorkspaceGuard } from '../intake/workspace.guard';
import { ZoomHostService } from './zoom-host.service';
import { ZoomHostController } from './zoom-host.controller';

@Module({ controllers: [MeetingsController, ZoomHostController], providers: [MeetingsService, WorkspaceGuard, ZoomHostService] })
export class MeetingsModule {}
