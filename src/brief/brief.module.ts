import { Module } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service';
import { WorkspaceGuard } from '../intake/workspace.guard';
import { BriefController } from './brief.controller';
import { BriefService } from './brief.service';

// Generation runs on the shared ParsingService worker loop registered in IntakeModule
// (it ticks over the ParseJob table regardless of which module created a row); this
// module only owns the Interview Brief question API surface and business logic.
@Module({ controllers: [BriefController], providers: [PrismaService, WorkspaceGuard, BriefService] })
export class BriefModule {}
