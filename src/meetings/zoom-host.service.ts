import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import type { Identity } from '../intake/workspace.guard';
import { MeetingsService } from './meetings.service';

type MeetingInfo = { id: string; password: string; joinUrl: string };
// One Zoom account, many meetings — keyed by a caller-chosen string. "default" is the
// account's original single meeting (Live Interview hosting, unaware of any specific
// round); a real InterviewRound.id keys that round's own meeting (Schedule's generated
// link). Each key gets its own independent create-once-then-reuse lifecycle.
type Account = {
  id: string; name: string; clientId: string; access: string; refresh: string; expires: number;
  meetings?: Record<string, MeetingInfo>;
  // The single key currently mid-creation (an outcome-uncertain create must never be
  // silently repeated) — at most one at a time, since `exclusive` serializes all work per owner.
  pendingKey?: string;
  /** @deprecated pre-per-round shape; migrated into meetings.default on read */
  meeting?: MeetingInfo;
  /** @deprecated pre-per-round shape; migrated into pendingKey on read */
  creating?: boolean;
};
const DEFAULT_MEETING_KEY = 'default';
type Pending = { server: Server; timer: NodeJS.Timeout; state: string };

@Injectable()
export class ZoomHostService implements OnModuleDestroy {
  private readonly pending = new Map<string, Pending>();
  private readonly failures = new Map<string, string>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly directory = join(process.cwd(), '.local', 'zoom');
  constructor(private readonly config: ConfigService, private readonly signatures: MeetingsService) {}

  private enabled() {
    if (this.config.get('NODE_ENV') === 'production' || this.config.get('ZOOM_DEV_ENABLED') !== 'true') throw new NotFoundException({ code: 'ZOOM_DISABLED' });
  }
  private owner(identity: Identity) { return createHash('sha256').update(JSON.stringify([identity.workspaceId, identity.actorId])).digest('hex'); }
  private clientId() {
    const id = this.config.get<string>('ZOOM_OAUTH_PUBLIC_CLIENT_ID')?.trim();
    if (!id) throw new ServiceUnavailableException({ code: 'ZOOM_PUBLIC_CLIENT_ID_REQUIRED' });
    return id;
  }
  private async exclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
    const next = (this.locks.get(key) || Promise.resolve()).catch(() => {}).then(work);
    this.locks.set(key, next);
    try { return await next; } finally { if (this.locks.get(key) === next) this.locks.delete(key); }
  }
  private async key() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = join(this.directory, 'encryption.key');
    try { await writeFile(path, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    return readFile(path);
  }
  private async read(owner: string): Promise<Account | null> {
    let data: Buffer;
    try { data = await readFile(join(this.directory, owner)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    const decipher = createDecipheriv('aes-256-gcm', await this.key(), data.subarray(0, 12));
    decipher.setAAD(Buffer.from(owner)); decipher.setAuthTag(data.subarray(12, 28));
    const account: Account = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString());
    // Migrate the pre-per-round shape in memory; persisted back on the next save() (any
    // write path already does one), never here — read() must stay side-effect-free.
    if (account.meeting && !account.meetings) { account.meetings = { [DEFAULT_MEETING_KEY]: account.meeting }; }
    if (account.creating && !account.pendingKey) { account.pendingKey = DEFAULT_MEETING_KEY; }
    delete account.meeting; delete account.creating;
    return account;
  }
  private async save(owner: string, account: Account) {
    const key = await this.key(); const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from(owner));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(account)), cipher.final()]);
    const path = join(this.directory, owner); const temporary = `${path}.${randomBytes(8).toString('hex')}`;
    await writeFile(temporary, Buffer.concat([iv, cipher.getAuthTag(), encrypted]), { mode: 0o600 });
    await rename(temporary, path);
  }
  private async call(url: string, init: RequestInit, operation: string): Promise<any> {
    let response: Response;
    try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) }); }
    catch { throw new ServiceUnavailableException({ code: `ZOOM_${operation}_UNCERTAIN` }); }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new BadRequestException({ code: `ZOOM_${operation}_FAILED`, providerStatus: response.status });
    return body;
  }
  private async token(parameters: Record<string, string>) {
    return this.call('https://zoom.us/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(parameters) }, 'TOKEN');
  }
  private close(owner: string) {
    const pending = this.pending.get(owner);
    if (pending) { clearTimeout(pending.timer); pending.server.close(); this.pending.delete(owner); }
  }
  onModuleDestroy() { for (const owner of this.pending.keys()) this.close(owner); }

  async status(identity: Identity) {
    this.enabled(); const owner = this.owner(identity); const account = await this.read(owner);
    const connected = !!account && account.clientId === this.config.get('ZOOM_OAUTH_PUBLIC_CLIENT_ID');
    const defaultMeeting = connected ? account!.meetings?.[DEFAULT_MEETING_KEY] : undefined;
    return { connected, name: connected ? account!.name : null, pending: this.pending.has(owner), error: this.failures.get(owner) || null, meeting: defaultMeeting ? { meetingNumber: defaultMeeting.id, joinUrl: defaultMeeting.joinUrl } : null };
  }

  async authorize(identity: Identity) {
    this.enabled(); const clientId = this.clientId(); const owner = this.owner(identity);
    return this.exclusive(owner, async () => {
      this.close(owner); this.failures.delete(owner);
      const state = randomBytes(32).toString('base64url'); const verifier = randomBytes(48).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      let redirect = ''; let consumed = false;
      const server = createServer(async (req, res) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        if (req.method !== 'GET' || url.pathname !== '/api/integrations/zoom/callback' || url.searchParams.get('state') !== state || consumed) { res.writeHead(400); res.end('Invalid OAuth callback.'); return; }
        consumed = true;
        try {
          if (url.searchParams.has('error') || !url.searchParams.get('code')) throw new Error('Denied');
          await this.exclusive(owner, async () => {
            const tokens = await this.token({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirect, code: url.searchParams.get('code')!, code_verifier: verifier });
            if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_in)) throw new Error('Invalid token response');
            const user = await this.call('https://api.zoom.us/v2/users/me', { headers: { Authorization: `Bearer ${tokens.access_token}` } }, 'PROFILE');
            if (!user.id) throw new Error('Invalid profile');
            const previous = await this.read(owner);
            await this.save(owner, { id: user.id, name: user.display_name || user.first_name || 'Zoom host', clientId, access: tokens.access_token, refresh: tokens.refresh_token, expires: Date.now() + tokens.expires_in * 1000, ...(previous && previous.id === user.id ? { meetings: previous.meetings } : {}) });
          });
          res.end('Zoom connected. You can close this tab and return to HireOS.');
        } catch (error) {
          const code = (error as { getResponse?: () => { code?: string } }).getResponse?.().code;
          this.failures.set(owner, code && /^ZOOM_[A-Z_]+$/.test(code) ? code : 'ZOOM_AUTH_FAILED');
          res.writeHead(400); res.end('Zoom authorization failed. Return to HireOS and check the displayed error code.');
        }
        finally { if (this.pending.get(owner)?.state === state) this.close(owner); }
      });
      server.requestTimeout = 30000; server.headersTimeout = 10000;
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('No loopback address');
      redirect = `http://127.0.0.1:${address.port}/api/integrations/zoom/callback`;
      const timer = setTimeout(() => { if (this.pending.get(owner)?.state === state) { this.failures.set(owner, 'ZOOM_AUTH_EXPIRED'); this.close(owner); } }, 5 * 60 * 1000); timer.unref();
      this.pending.set(owner, { server, timer, state });
      const authorization = new URL('https://zoom.us/oauth/authorize');
      authorization.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirect, code_challenge: challenge, code_challenge_method: 'S256', state }).toString();
      return { authorizationUrl: authorization.toString() };
    });
  }

  private async account(owner: string) {
    const account = await this.read(owner);
    if (!account || account.clientId !== this.clientId()) throw new BadRequestException({ code: 'ZOOM_CONNECT_REQUIRED' });
    if (account.expires < Date.now() + 60000) {
      const tokens = await this.token({ grant_type: 'refresh_token', client_id: account.clientId, refresh_token: account.refresh });
      if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_in)) throw new BadRequestException({ code: 'ZOOM_CONNECT_REQUIRED' });
      account.access = tokens.access_token; account.refresh = tokens.refresh_token; account.expires = Date.now() + tokens.expires_in * 1000;
      await this.save(owner, account);
    }
    return account;
  }

  // Creates the meeting for one key on first use (never repeats a create whose outcome is
  // uncertain — see the 4xx-only reset below), and just returns it otherwise. Shared by
  // `start` (the account's own "default" meeting, plus a ZAK token to host live) and
  // `link` (any key — typically a real InterviewRound.id — no ZAK, no host-SDK signature,
  // just a URL to attach to a scheduled round well before anyone hosts it).
  private async ensureMeeting(owner: string, account: Account, key: string, topic: string): Promise<MeetingInfo> {
    if (account.pendingKey === key) throw new BadRequestException({ code: 'ZOOM_CREATE_UNCERTAIN_CHECK_ACCOUNT' });
    const existing = account.meetings?.[key];
    if (existing) return existing;
    const headers = { Authorization: `Bearer ${account.access}`, 'Content-Type': 'application/json' };
    account.pendingKey = key; await this.save(owner, account);
    const meeting = await this.call('https://api.zoom.us/v2/users/me/meetings', { method: 'POST', headers, body: JSON.stringify({ topic, type: 1, settings: { use_pmi: false, host_video: false, participant_video: false, join_before_host: false, waiting_room: true, auto_recording: 'none' } }) }, 'CREATE').catch(async error => {
      const status = error.getResponse?.().providerStatus;
      if (status >= 400 && status < 500) { account.pendingKey = undefined; await this.save(owner, account); }
      throw error;
    });
    if (!meeting.id || !meeting.join_url || !meeting.password) throw new ServiceUnavailableException({ code: 'ZOOM_CREATE_UNCERTAIN_CHECK_ACCOUNT' });
    const info: MeetingInfo = { id: String(meeting.id), password: meeting.password, joinUrl: meeting.join_url };
    account.meetings = { ...(account.meetings || {}), [key]: info };
    account.pendingKey = undefined;
    await this.save(owner, account);
    return info;
  }

  // `key` defaults to the account's own "default" meeting (Live Interview opened on its
  // own, no specific round in mind); passing a real InterviewRound.id instead hosts —
  // and, if Schedule already generated one, reuses — that round's own meeting, so joining
  // from a round's "Join link" always lands in the same room that link points to.
  async start(identity: Identity, key?: string, topic?: string) {
    this.enabled(); const owner = this.owner(identity);
    return this.exclusive(owner, async () => {
      const account = await this.account(owner);
      const meeting = await this.ensureMeeting(owner, account, key?.trim() || DEFAULT_MEETING_KEY, topic?.trim() || 'HireOS Interview');
      const headers = { Authorization: `Bearer ${account.access}`, 'Content-Type': 'application/json' };
      const zak = await this.call('https://api.zoom.us/v2/users/me/zak', { headers }, 'ZAK');
      if (!zak.token) throw new ServiceUnavailableException({ code: 'ZOOM_ZAK_FAILED' });
      return { ...this.signatures.hostConfig(meeting.id, meeting.password, account.name), zak: zak.token, joinUrl: meeting.joinUrl };
    });
  }

  /** Ensures the meeting for `roundId` exists and returns just its link — no ZAK token, no
   * host-SDK signature. Each round gets its own independent Zoom meeting, created once and
   * reused on every subsequent call for the same round. */
  async link(identity: Identity, roundId: string, topic?: string) {
    this.enabled(); const owner = this.owner(identity);
    return this.exclusive(owner, async () => {
      const account = await this.account(owner);
      const meeting = await this.ensureMeeting(owner, account, roundId, topic?.trim() || 'HireOS Interview');
      return { meetingNumber: meeting.id, joinUrl: meeting.joinUrl };
    });
  }

  /** Clears one meeting so the next `start`/`link` for that key creates a fresh one.
   * Defaults to the account's own "default" (Live Interview) meeting when no key is given. */
  async resetMeeting(identity: Identity, key?: string) {
    this.enabled(); const owner = this.owner(identity);
    return this.exclusive(owner, async () => {
      const account = await this.read(owner);
      if (!account) throw new BadRequestException({ code: 'ZOOM_CONNECT_REQUIRED' });
      const target = key?.trim() || DEFAULT_MEETING_KEY;
      if (account.meetings) delete account.meetings[target];
      if (account.pendingKey === target) account.pendingKey = undefined;
      await this.save(owner, account);
      return { reset: true };
    });
  }
}
