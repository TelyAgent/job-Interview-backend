import { Module } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service';
import { WorkspaceGuard } from '../intake/workspace.guard';
import { RubricController } from './rubric.controller';
import { RubricService } from './rubric.service';

// Generation actually runs on the shared ParsingService worker loop registered in
// IntakeModule (it ticks over the ParseJob table regardless of which module created a
// row); this module only owns the Requirements & Rubric API surface and business logic.
@Module({ controllers: [RubricController], providers: [PrismaService, WorkspaceGuard, RubricService] })
export class RubricModule {}
