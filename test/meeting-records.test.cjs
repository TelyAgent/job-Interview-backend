require('dotenv').config({ quiet: true });
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile, readdir } = require('node:fs/promises');
const { PrismaClient } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const { ConfigModule } = require('@nestjs/config');
const { MeetingRecordsModule } = require('../dist/meeting-records/meeting-records.module');
const { WorkspaceGuard } = require('../dist/intake/workspace.guard');

test('persistent meeting notes: authorization, sessions, revisions and recovery', async () => {
  const schema = `records_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(process.env.DATABASE_URL); url.searchParams.set('schema', schema);
  process.env.DATABASE_URL = url.toString();
  const db = new PrismaClient();
  let app;
  try {
    await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    for (const folder of (await readdir('prisma/migrations')).filter(name => /^\d/.test(name)).sort()) {
      const sql = await readFile(`prisma/migrations/${folder}/migration.sql`, 'utf8');
      for (const statement of sql.split(';').filter(s => s.trim())) await db.$executeRawUnsafe(statement);
    }
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true }), MeetingRecordsModule] }).overrideGuard(WorkspaceGuard).useValue({
      canActivate(context) {
        const req = context.switchToHttp().getRequest();
        req.identity = { workspaceId: req.headers['test-workspace'] || 'test-workspace', actorId: req.headers['test-actor'] || 'owner' }; return true;
      },
    }).compile();
    app = module.createNestApplication({ logger: false }); app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
    const send = (path, method = 'GET', body, headers = {}) => fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', 'x-hireos-record': '1', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const job = await db.job.create({ data: { workspaceId: 'test-workspace', createdBy: 'owner', requestKey: randomUUID(), requestHash: 'fixture', title: 'Fixture job', jdText: '' } });
    const candidate = await db.candidate.create({ data: { workspaceId: 'test-workspace', name: 'Fixture candidate' } });
    const task = await db.interviewTask.create({ data: { workspaceId: 'test-workspace', createdBy: 'owner', jobId: job.id, candidateId: candidate.id } });
    assert.equal((await (await send('/meeting-record-tasks')).json()).length, 1);
    assert.equal((await (await send('/meeting-record-tasks', 'GET', undefined, { 'test-actor': 'other' })).json()).length, 0);
    const path = `/tasks/${task.id}/interview-sessions`;
    assert.equal((await send(path, 'POST', { round: 0 })).status, 400);
    assert.equal((await send(path, 'POST', { round: 1 }, { 'x-hireos-record': '' })).status, 403);
    const sessions = await Promise.all([send(path, 'POST', { round: 1 }), send(path, 'POST', { round: 1 })]);
    const [first, same] = await Promise.all(sessions.map(r => r.json()));
    assert.equal(first.session.id, same.session.id);
    assert.equal(first.transcript.status, 'unavailable');
    const recordPath = `/interview-sessions/${first.session.id}/record`;
    const notePath = `${recordPath}/notes/me`;
    assert.equal((await send(recordPath, 'GET', undefined, { 'test-workspace': 'other' })).status, 404);
    assert.equal((await send(recordPath, 'GET', undefined, { 'test-actor': 'other' })).status, 404);
    assert.equal((await send(notePath, 'PUT', { version: 0, content: 'forbidden' }, { 'test-actor': 'other' })).status, 404);
    const saved = await send(notePath, 'PUT', { version: 0, content: '真实笔记\nInterview notes' });
    assert.equal(saved.status, 200); assert.equal(saved.headers.get('cache-control'), 'no-store');
    assert.equal((await saved.json()).version, 1);
    assert.equal((await (await send(recordPath)).json()).note.content, '真实笔记\nInterview notes');
    const retry = await send(notePath, 'PUT', { version: 0, content: '真实笔记\nInterview notes' });
    assert.equal((await retry.json()).version, 1, 'lost response retry is idempotent');
    const concurrent = await Promise.all(['draft A', 'draft B'].map(content => send(notePath, 'PUT', { version: 1, content })));
    assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
    assert.equal((await send(notePath, 'PUT', { version: 2, content: 'x'.repeat(50001) })).status, 400);
    const second = await (await send(path, 'POST', { round: 2 })).json();
    assert.notEqual(second.session.id, first.session.id); assert.equal(second.note.content, '');
    const current = await (await send(recordPath)).json();
    assert.equal((await send(notePath, 'PUT', { version: current.note.version, content: '' })).status, 200);
    assert.equal((await (await send(recordPath)).json()).note.content, '', 'clearing notes persists');
  } finally {
    if (app) await app.close();
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
  }
});
