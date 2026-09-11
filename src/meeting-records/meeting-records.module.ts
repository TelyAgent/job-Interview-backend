import { Module } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service';
import { WorkspaceGuard } from '../intake/workspace.guard';
import { MeetingRecordsController } from './meeting-records.controller';
import { MeetingRecordsService } from './meeting-records.service';

@Module({ controllers: [MeetingRecordsController], providers: [PrismaService, WorkspaceGuard, MeetingRecordsService] })
export class MeetingRecordsModule {}
