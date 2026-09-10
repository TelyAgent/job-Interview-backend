import { Body, Controller, Get, Headers, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MaterialsService } from './materials.service';
import { ProjectsService } from './projects.service';
import { ParsingService } from './parsing.service';
import { WorkspaceGuard, type Identity } from './workspace.guard';

@Controller()
@UseGuards(WorkspaceGuard)
export class IntakeController {
  constructor(private readonly materials: MaterialsService, private readonly projects: ProjectsService, private readonly parsing: ParsingService) {}
  @Post('materials')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } }))
  upload(@Req() req: { identity: Identity }, @UploadedFile() file?: Express.Multer.File) { return this.materials.upload(req.identity.workspaceId, file); }
  @Get('materials/:id')
  material(@Req() req: { identity: Identity }, @Param('id') id: string) { return this.materials.get(req.identity.workspaceId, id); }
  @Post('projects')
  create(@Req() req: { identity: Identity }, @Headers('idempotency-key') key: string, @Body() body: unknown) { return this.projects.create(req.identity, key, body); }
  @Get('projects')
  list(@Req() req: { identity: Identity }) { return this.projects.list(req.identity.workspaceId); }
  @Get('projects/:id')
  project(@Req() req: { identity: Identity }, @Param('id') id: string) { return this.projects.get(req.identity.workspaceId, id); }
  @Patch('projects/:id/intake')
  review(@Req() req: { identity: Identity }, @Param('id') id: string, @Body() body: unknown) { return this.projects.review(req.identity, id, body); }
  @Post('projects/:id/requirements-extractions')
  requirements(@Req() req: { identity: Identity }, @Param('id') id: string) { return this.projects.extractRequirements(req.identity.workspaceId, id); }
  @Post('projects/:id/materials')
  attach(@Req() req: { identity: Identity }, @Param('id') id: string, @Body() body: unknown) { return this.projects.attach(req.identity, id, body); }
  @Get('parsing-jobs/:id')
  job(@Req() req: { identity: Identity }, @Param('id') id: string) { return this.parsing.get(req.identity.workspaceId, id); }
  @Post('parsing-jobs/:id/retry')
  retry(@Req() req: { identity: Identity }, @Param('id') id: string) { return this.parsing.retry(req.identity.workspaceId, id); }
}
