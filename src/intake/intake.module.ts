import { Module } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service';
import { AiService } from './ai.service';
import { IntakeController } from './intake.controller';
import { MaterialsService } from './materials.service';
import { CandidatesService } from './candidates.service';
import { JobsService } from './jobs.service';
import { TasksService } from './tasks.service';
import { RoundsService } from './rounds.service';
import { ParsingService } from './parsing.service';
import { WorkspaceGuard } from './workspace.guard';

@Module({ controllers: [IntakeController], providers: [PrismaService, AiService, MaterialsService, CandidatesService, JobsService, TasksService, RoundsService, ParsingService, WorkspaceGuard] })
export class IntakeModule {}
