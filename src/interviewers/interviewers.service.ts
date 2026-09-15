import { Injectable } from '@nestjs/common';
import { PrismaService } from '../persistence/prisma.service';

@Injectable()
export class InterviewersService {
  constructor(private readonly db: PrismaService) {}
  list(workspaceId: string) {
    return this.db.interviewer.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, title: true, email: true },
    });
  }
}
