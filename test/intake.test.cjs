const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { randomUUID } = require('node:crypto');
const { unlink, readdir, readFile } = require('node:fs/promises');
const { PrismaClient } = require('@prisma/client');
const { resolve } = require('node:path');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/persistence/prisma.service');
const { ParsingService } = require('../dist/intake/parsing.service');
const { ProjectsService } = require('../dist/intake/projects.service');
const { WorkspaceGuard } = require('../dist/intake/workspace.guard');
const { AiService } = require('../dist/intake/ai.service');

function pdfFixture(text) {
  const stream = text ? `BT /F1 12 Tf 50 750 Td (${text}) Tj ET` : '';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let value = '%PDF-1.4\n'; const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(value.length); value += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = value.length;
  value += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(value);
}

test('intake persistence, validation, parsing and recovery', async (t) => {
  const schema = `intake_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('schema', schema);
  process.env.DATABASE_URL = url.toString();
  const setupDb = new PrismaClient();
  await setupDb.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  for (const folder of (await readdir('prisma/migrations')).filter((name) => /^\d/.test(name)).sort()) {
    const sql = await readFile(`prisma/migrations/${folder}/migration.sql`, 'utf8');
    for (const statement of sql.split(';').filter((s) => s.trim())) await setupDb.$executeRawUnsafe(statement);
  }
  let mode = 'ok';
  const model = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    assert.equal(request.temperature, undefined);
    const source = JSON.parse(request.messages[1].content);
    const segment = source.segments[0];
    const fact = { value: segment.text, segmentId: segment.id, quote: mode === 'bad-source' ? 'invented source' : segment.text };
    const result = { title: fact, name: null, email: null, facts: [], missingFields: [], warnings: [] };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: mode === 'bad-json' ? '{' : JSON.stringify(result) } }], usage: { total_tokens: 10 } }));
  });
  await new Promise((done) => model.listen(0, '127.0.0.1', done));
  process.env.HIREOS_AI_BASE_URL = `http://127.0.0.1:${model.address().port}`;
  process.env.HIREOS_AI_API_KEY = 'test-only'; process.env.HIREOS_AI_MODEL = 'fixture-model';
  process.env.HIREOS_AI_TIMEOUT_SECONDS = '60';
  const workspaceId = `test-${randomUUID()}`;
  const identity = { workspaceId, actorId: 'test-user' };
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideGuard(WorkspaceGuard).useValue({
    canActivate(context) { context.switchToHttp().getRequest().identity = identity; return true; },
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  const db = app.get(PrismaService); const worker = app.get(ParsingService);
  await worker.onModuleDestroy();
  const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
  const send = (path, body, key = randomUUID(), method = 'POST') => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) });
  const input = { jd: { text: 'Backend Engineer\n\nBuild reliable APIs.', effectiveSource: 'text' }, materials: [] };
  const ids = [];
  let project;
  try {
    await t.test('JD-only persists; concurrent retries deduplicate; changed payload conflicts', async () => {
      const key = randomUUID();
      const responses = await Promise.all([send('/projects', input, key), send('/projects', input, key)]);
      assert.ok(responses.every((r) => r.status === 201));
      const [a, b] = await Promise.all(responses.map((r) => r.json())); project = a; ids.push(a.id);
      assert.equal(a.id, b.id); assert.equal(a.candidateName, null); assert.equal(a.jobs.length, 1);
      assert.equal((await send('/projects', { ...input, jd: { ...input.jd, text: 'Different' } }, key)).status, 409);
      assert.equal((await send('/projects', { jd: { text: '', effectiveSource: 'text' } })).status, 400);
      const read = await (await fetch(`${base}/projects/${a.id}`)).json(); assert.equal(read.jdText, input.jd.text);
    });
    await t.test('workspace isolation and production fail-closed guard', async () => {
      await assert.rejects(app.get(ProjectsService).get('different-workspace', project.id), (e) => e.getStatus() === 404);
      const guard = new WorkspaceGuard(new ConfigService({ NODE_ENV: 'production', DEV_AUTH_ENABLED: 'true' }));
      assert.throws(() => guard.canActivate({}), (e) => e.getStatus() === 401);
    });
    await t.test('real TXT, PDF and DOCX extraction; OCR, invalid and oversized files', async () => {
      const upload = async (name, content) => { const form = new FormData(); form.append('file', new Blob([content]), name); return fetch(`${base}/materials`, { method: 'POST', body: form }); };
      let response = await upload('resume.txt', 'Ada Example\n\nBuilt APIs with NestJS.');
      assert.equal(response.status, 201); const material = await response.json();
      assert.equal(material.readStatus, 'available'); assert.match(material.text, /Ada/);
      assert.equal(material.storageKey, undefined);
      assert.equal((await upload('fake.pdf', 'not pdf')).status, 400);
      assert.equal((await upload('empty.txt', '')).status, 400);
      assert.equal((await upload('large.txt', Buffer.alloc(10 * 1024 * 1024 + 1))).status, 413);
      response = await upload('role.pdf', pdfFixture('PDF Engineer'));
      assert.equal(response.status, 201); const pdf = await response.json(); assert.match(pdf.text, /PDF Engineer/); assert.equal(pdf.segments[0].page, 1);
      response = await upload('scan.pdf', pdfFixture(''));
      assert.equal((await response.json()).errorCode, 'OCR_REQUIRED');
      const JSZip = require('jszip'); const zip = new JSZip();
      zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
      zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX Engineer</w:t></w:r></w:p></w:body></w:document>');
      response = await upload('role.docx', await zip.generateAsync({ type: 'nodebuffer' }));
      assert.equal(response.status, 201); assert.match((await response.json()).text, /DOCX Engineer/);
      response = await send(`/projects/${project.id}/materials`, { materialId: material.id, kind: 'resume' });
      assert.equal(response.status, 201); assert.equal((await response.json()).materials.length, 1);
    });
    await t.test('AI extraction is sourced and never silently edits project fields', async () => {
      await worker.tick();
      const job = await db.parseJob.findFirst({ where: { projectId: project.id, type: 'jd' } });
      assert.equal(job.status, 'needs_review'); assert.equal(job.result.title.segmentId, 's1');
      const original = await db.project.findUnique({ where: { id: project.id } });
      assert.equal(original.reviewed, false); assert.equal(original.title, 'Backend Engineer');
    });
    await t.test('invalid AI responses and missing configuration stay explicit', async () => {
      const ai = app.get(AiService); const source = { sourceId: 'test', segments: [{ id: 's1', text: 'Engineer' }] };
      mode = 'bad-json'; await assert.rejects(ai.extract('jd', source), (e) => e.code === 'AI_OUTPUT_INVALID');
      mode = 'bad-source'; await assert.rejects(ai.extract('jd', source), (e) => e.code === 'AI_SOURCE_INVALID');
      mode = 'ok';
      await assert.rejects(new AiService({ get: () => undefined }).extract('jd', source), (e) => e.code === 'AI_NOT_CONFIGURED');
    });
    await t.test('manual changes use optimistic locking and a separate JD version', async () => {
      const body = { version: 1, title: 'Reviewed role', candidateName: 'Ada Example', candidateEmail: 'ada@example.test', jdText: 'Updated role requirements' };
      let response = await send(`/projects/${project.id}/intake`, body, '', 'PATCH');
      assert.equal(response.status, 200); const saved = await response.json();
      assert.equal(saved.version, 2); assert.equal(saved.jdVersion, 2); assert.equal(saved.reviewed, true);
      response = await send(`/projects/${project.id}/intake`, body, '', 'PATCH'); assert.equal(response.status, 409);
      assert.equal(await db.revision.count({ where: { projectId: project.id } }), 2);
    });
    await t.test('expired leases recover without overriding human edits', async () => {
      await db.parseJob.updateMany({ where: { projectId: project.id, type: 'resume' }, data: { status: 'failed' } });
      const job = await db.parseJob.findFirst({ where: { projectId: project.id, type: 'jd', inputVersion: 2 } });
      await db.parseJob.update({ where: { id: job.id }, data: { status: 'parsing', leaseToken: 'dead-worker', leaseUntil: new Date(0) } });
      await worker.tick();
      assert.equal((await db.parseJob.findUnique({ where: { id: job.id } })).status, 'needs_review');
      assert.equal((await db.project.findUnique({ where: { id: project.id } })).title, 'Reviewed role');
    });
  } finally {
    const materials = await db.material.findMany({ where: { workspaceId } });
    await db.project.deleteMany({ where: { workspaceId } });
    await db.material.deleteMany({ where: { workspaceId } });
    for (const material of materials) await unlink(resolve(process.env.STORAGE_DIR || '.local/materials', material.storageKey)).catch(() => {});
    await app.close(); await new Promise((done) => model.close(done));
    await setupDb.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await setupDb.$disconnect();
  }
});
