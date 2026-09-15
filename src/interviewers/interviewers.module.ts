import { Module } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service';
import { WorkspaceGuard } from '../intake/workspace.guard';
import { InterviewersController } from './interviewers.controller';
import { InterviewersService } from './interviewers.service';

@Module({ controllers: [InterviewersController], providers: [PrismaService, WorkspaceGuard, InterviewersService] })
export class InterviewersModule {}
