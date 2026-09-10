import { Module } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service';
import { AiService } from './ai.service';
import { IntakeController } from './intake.controller';
import { MaterialsService } from './materials.service';
import { ProjectsService } from './projects.service';
import { ParsingService } from './parsing.service';
import { WorkspaceGuard } from './workspace.guard';

@Module({ controllers: [IntakeController], providers: [PrismaService, AiService, MaterialsService, ProjectsService, ParsingService, WorkspaceGuard] })
export class IntakeModule {}
