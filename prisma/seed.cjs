#!/usr/bin/env node
// Seeds the local dev API with the sample JD/résumé files under data/, following the
// pairing suggested in data/AI岗位描述样本/README.md: one well-matched résumé per JD,
// plus every résumé linked to the deliberately mismatched "全栈工程师" JD so the
// Cluster-by-JD view shows both a single-candidate JD and a multi-candidate one with a
// visible spread of match scores. Goes through the real HTTP API (not raw Prisma writes)
// so file storage, hashing and AI parsing all run exactly as they would for a real user.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const BASE = process.env.API_BASE || 'http://127.0.0.1:3001/api';
const JD_DIR = path.join(__dirname, '..', 'data', 'AI岗位描述样本');
const RESUME_DIR = path.join(__dirname, '..', 'data', 'AI岗位简历样本');

const JOBS = [
  { file: '01-高级AI产品经理-企业智能平台.txt', resumes: ['01-林若晨-AI产品经理.pdf'] },
  { file: '02-AI项目经理-行业智能化.txt', resumes: ['02-周启航-AI项目经理.pdf'] },
  { file: '03-高级后端工程师-AI平台.txt', resumes: ['03-陈子墨-AI后端工程师.pdf'] },
  { file: '04-高级产品设计师-AI体验.txt', resumes: ['04-许安然-AI产品设计师.pdf'] },
  { file: '05-财务运营经理-AI SaaS.txt', resumes: ['05-宋嘉言-财务运营经理.pdf'] },
  {
    file: '06-全栈工程师-招聘平台.txt',
    resumes: [
      '01-林若晨-AI产品经理.pdf', '02-周启航-AI项目经理.pdf', '03-陈子墨-AI后端工程师.pdf',
      '04-许安然-AI产品设计师.pdf', '05-宋嘉言-财务运营经理.pdf',
    ],
  },
];

async function uploadMaterial(filePath) {
  const buffer = fs.readFileSync(filePath);
  const form = new FormData();
  form.append('file', new Blob([buffer]), path.basename(filePath));
  const res = await fetch(`${BASE}/materials`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`upload failed for ${filePath}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function createJob(jdMaterialId, resumeMaterialIds) {
  const res = await fetch(`${BASE}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({
      jd: { materialId: jdMaterialId, effectiveSource: 'file' },
      resumes: resumeMaterialIds.map((id) => ({ materialId: id })),
    }),
  });
  if (!res.ok) throw new Error(`job create failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  for (const job of JOBS) {
    const jdMaterial = await uploadMaterial(path.join(JD_DIR, job.file));
    const resumeMaterials = [];
    for (const resumeFile of job.resumes) resumeMaterials.push(await uploadMaterial(path.join(RESUME_DIR, resumeFile)));
    const created = await createJob(jdMaterial.id, resumeMaterials.map((m) => m.id));
    console.log(`Created job "${created.title}" with ${created.tasks.length} task(s): ${created.tasks.map((t) => t.candidate.name).join(', ')}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
