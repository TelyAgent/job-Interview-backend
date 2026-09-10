import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';
import { PrismaService } from '../persistence/prisma.service';
import type { Segment } from './contracts';

@Injectable()
export class MaterialsService {
  constructor(private readonly db: PrismaService, private readonly config: ConfigService) {}
  async upload(workspaceId: string, file?: Express.Multer.File) {
    if (!file || !file.size) throw new BadRequestException({ code: 'EMPTY_FILE' });
    const ext = extname(file.originalname).toLowerCase();
    const mime = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.txt': 'text/plain' }[ext];
    if (!mime || (ext === '.pdf' && file.buffer.subarray(0, 5).toString() !== '%PDF-') ||
      (ext === '.docx' && file.buffer.subarray(0, 2).toString() !== 'PK')) {
      throw new BadRequestException({ code: 'UNSUPPORTED_FILE_TYPE' });
    }
    let segments: Segment[] = [];
    let errorCode: string | null = null;
    try {
      if (ext === '.pdf') {
        const parser = new PDFParse({ data: file.buffer });
        try {
          const result = await parser.getText();
          segments = result.pages.flatMap((p) => splitText(p.text, p.num));
        } finally { await parser.destroy(); }
      } else {
        const text = ext === '.docx' ? (await mammoth.extractRawText({ buffer: file.buffer })).value
          : new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
        if (text.includes('\0')) throw new Error('binary');
        segments = splitText(text);
      }
      segments = segments.map((s, i) => ({ ...s, id: `s${i + 1}` }));
      if (!segments.length) errorCode = ext === '.pdf' ? 'OCR_REQUIRED' : 'NO_EXTRACTABLE_TEXT';
      if (segments.reduce((n, s) => n + s.text.length, 0) > 150000) { segments = []; errorCode = 'DOCUMENT_TOO_LONG'; }
    } catch { errorCode = 'FILE_UNREADABLE'; }
    const root = resolve(this.config.get('STORAGE_DIR', '.local/materials'));
    await mkdir(root, { recursive: true, mode: 0o700 });
    const storageKey = randomUUID();
    const path = join(root, storageKey);
    await writeFile(path, file.buffer, { mode: 0o600, flag: 'wx' });
    try {
      const material = await this.db.material.create({ data: {
        workspaceId, name: file.originalname.slice(0, 255), mime, size: file.size, storageKey,
        hash: createHash('sha256').update(file.buffer).digest('hex'),
        text: segments.map((s) => s.text).join('\n\n'), segments,
        readStatus: errorCode ? 'failed' : 'available', errorCode,
      } });
      const { storageKey: _key, ...safe } = material;
      return safe;
    } catch (error) { await unlink(path); throw error; }
  }
  async get(workspaceId: string, id: string) {
    const material = await this.db.material.findFirst({ where: { id, workspaceId } });
    if (!material) throw new NotFoundException({ code: 'NOT_FOUND' });
    const { storageKey: _key, ...safe } = material;
    return safe;
  }
}

export function splitText(text: string, page?: number): Segment[] {
  return text.split(/\n\s*\n/).flatMap((paragraph) => {
    const result: Segment[] = [];
    const trimmed = paragraph.trim();
    for (let start = 0; start < trimmed.length; start += 4000) {
      result.push({ id: '', text: trimmed.slice(start, start + 4000), ...(page ? { page } : {}) });
    }
    return result;
  }).map((s, i) => ({ ...s, id: `s${i + 1}` }));
}
