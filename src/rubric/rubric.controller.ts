import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { RubricService } from './rubric.service';
import { WorkspaceGuard, type Identity } from '../intake/workspace.guard';

@Controller()
@UseGuards(WorkspaceGuard)
export class RubricController {
  constructor(private readonly rubric: RubricService) {}

  @Post('jobs/:id/capability-cards')
  generate(@Req() req: { identity: Identity }, @Param('id') id: string) {
    return this.rubric.generate(req.identity.workspaceId, id);
  }

  @Get('jobs/:id/rubric')
  getRubric(@Req() req: { identity: Identity }, @Param('id') id: string) {
    return this.rubric.getRubric(req.identity.workspaceId, id);
  }

  @Patch('jobs/:id/rubric')
  updateRubric(@Req() req: { identity: Identity }, @Param('id') id: string, @Body() body: unknown) {
    return this.rubric.update(req.identity, id, body);
  }

  @Post('jobs/:id/rubric/confirm')
  confirmRubric(@Req() req: { identity: Identity }, @Param('id') id: string, @Body() body: unknown) {
    return this.rubric.confirm(req.identity, id, body);
  }

  @Post('jobs/:id/rubric/new-version')
  newRubricVersion(@Req() req: { identity: Identity }, @Param('id') id: string) {
    return this.rubric.newVersion(req.identity, id);
  }
}
