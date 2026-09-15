import { Body, Controller, Get, Headers, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MaterialsService } from './materials.service';
import { JobsService } from './jobs.service';
import { TasksService } from './tasks.service';
import { RoundsService } from './rounds.service';
import { ParsingService } from './parsing.service';
import { WorkspaceGuard, type Identity } from './workspace.guard';

@Controller()
@UseGuards(WorkspaceGuard)
export class IntakeController {
  constructor(
    private readonly materials: MaterialsService,
    private readonly jobs: JobsService,
    private readonly tasks: TasksService,
    private readonly rounds: RoundsService,
    private readonly parsing: ParsingService,
  ) {}
  @Post('materials')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } }))
  upload(@Req() req: { identity: Identity }, @UploadedFile() file?: Express.Multer.File) { return this.materials.upload(req.identity.workspaceId, file); }
  @Get('materials/:id')
  material(@Req() req: { identity: Identity }, @Param('id') id: string) { return this.materials.get(req.identity.workspaceId, id); }

  @Post('jobs')
  createJob(@Req() req: { identity: Identity }, @Headers('idempotency-key') key: string, @Body() body: unknown) { return this.jobs.create(req.identity, key, body); }
  @Get('jobs')
  listJobs(@Req() req: { identity: Identity }) { return this.jobs.list(req.identity.workspaceId); }
  @Get('jobs/:id')
  job(@Req() req: { identity: Identity }, @Param('id') id: string) { return this.jobs.get(req.identity.workspaceId, id); }
  @Patch('jobs/:id/intake')
  reviewJob(@Req() req: { identity: Identity }, @Param('id') id: string, @Body() body: unknown) { return this.jobs.review(req.identity, id, body); }
  @Post('jobs/:id/requirements-extractions')
  requirements(@Req() req: { identity: Identity }, @Param('id') id: string) { return this.jobs.extractRequirements(req.identity.workspaceId, id); }
  @Post('jobs/:id/materials')
  attachJobMaterial(@Req() req: { identity: Identity }, @Param('id') id: string, @Body() body: { materialId: string }) { return this.jobs.attachMaterial(req.identity, id, body.materialId); }

  @Post('jobs/:id/tasks')
  createTask(@Req() req: { identity: Identity }, @Param('id') id: string, @Body() body: unknown) { return this.tasks.create(req.identity, id, body); }
  @Get('tasks')
  listTasks(@Req() req: { identity: Identity }) { return this.tasks.list(req.identity.workspaceId); }
  @Get('tasks/:id')
  task(@Req() req: { identity: Identity }, @Param('id') id: string) { return this.tasks.get(req.identity.workspaceId, id); }
  @Patch('tasks/:id/intake')
  reviewTask(@Req() req: { identity: Identity }, @Param('id') id: string, @Body() body: unknown) { return this.tasks.review(req.identity, id, body); }
  @Post('tasks/:id/materials')
  attachTaskMaterial(@Req() req: { identity: Identity }, @Param('id') id: string, @Body() body: unknown) { return this.tasks.attach(req.identity, id, body); }

  @Get('tasks/:id/rounds')
  listRounds(@Req() req: { identity: Identity }, @Param('id') id: string) { return this.rounds.listForTask(req.identity.workspaceId, id); }
  @Post('tasks/:id/rounds')
  createRound(@Req() req: { identity: Identity }, @Param('id') id: string, @Body() body: unknown) { return this.rounds.createForTask(req.identity, id, body); }
  @Patch('rounds/:id')
  updateRound(@Req() req: { identity: Identity }, @Param('id') id: string, @Body() body: unknown) { return this.rounds.update(req.identity, id, body); }

  @Get('parsing-jobs/:id')
  parsingJob(@Req() req: { identity: Identity }, @Param('id') id: string) { return this.parsing.get(req.identity.workspaceId, id); }
  @Post('parsing-jobs/:id/retry')
  retry(@Req() req: { identity: Identity }, @Param('id') id: string) { return this.parsing.retry(req.identity.workspaceId, id); }
}
