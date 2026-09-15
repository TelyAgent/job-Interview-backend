require('dotenv').config({ quiet: true });
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile, readdir } = require('node:fs/promises');
const { PrismaClient } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const { ConfigModule } = require('@nestjs/config');
const { InterviewersModule } = require('../dist/interviewers/interviewers.module');
const { WorkspaceGuard } = require('../dist/intake/workspace.guard');

test('interviewers: listed per workspace, ordered, safe fields only', async () => {
  const schema = `interviewers_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(process.env.DATABASE_URL); url.searchParams.set('schema', schema);
  process.env.DATABASE_URL = url.toString();
  const db = new PrismaClient();
  let app;
  try {
    await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for (const folder of (await readdir('prisma/migrations')).filter((name) => /^\d/.test(name)).sort()) {
      const sql = await readFile(`prisma/migrations/${folder}/migration.sql`, 'utf8');
      for (const statement of sql.split(';').filter((s) => s.trim())) await db.$executeRawUnsafe(statement);
    }
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), InterviewersModule] }).overrideGuard(WorkspaceGuard).useValue({
      canActivate(context) {
        const req = context.switchToHttp().getRequest();
        req.identity = { workspaceId: req.headers['test-workspace'] || 'test-workspace', actorId: 'owner' };
        return true;
      },
    }).compile();
    app = module.createNestApplication({ logger: false }); app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;

    await db.interviewer.create({ data: { workspaceId: 'test-workspace', name: 'David Kim', title: 'Hiring Manager', email: 'david.kim@example.com' } });
    await db.interviewer.create({ data: { workspaceId: 'test-workspace', name: 'Priya Nair', title: 'Business Interviewer' } });
    await db.interviewer.create({ data: { workspaceId: 'other-workspace', name: 'Someone Else', title: 'HR Manager' } });

    const list = await (await fetch(`${base}/interviewers`, { headers: { 'test-workspace': 'test-workspace' } })).json();
    assert.equal(list.length, 2);
    assert.deepEqual(list.map((i) => i.name), ['David Kim', 'Priya Nair']);
    assert.equal(list[0].title, 'Hiring Manager');
    assert.equal(list[1].email, null);
    assert.equal(Object.keys(list[0]).sort().join(','), 'email,id,name,title');

    const otherList = await (await fetch(`${base}/interviewers`, { headers: { 'test-workspace': 'other-workspace' } })).json();
    assert.equal(otherList.length, 1);
    assert.equal(otherList[0].name, 'Someone Else');
  } finally {
    if (app) await app.close();
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
  }
});
