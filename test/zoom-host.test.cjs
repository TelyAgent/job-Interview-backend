require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, readdir } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
const { ZoomHostService } = require('../dist/meetings/zoom-host.service');
const { MeetingsService } = require('../dist/meetings/meetings.service');
const identity = { workspaceId: 'test', actorId: 'actor' };
const config = { get: key => ({ NODE_ENV: 'development', ZOOM_DEV_ENABLED: 'true', ZOOM_OAUTH_PUBLIC_CLIENT_ID: 'public-id', ZOOM_MEETING_SDK_CLIENT_ID: 'sdk-id', ZOOM_MEETING_SDK_CLIENT_SECRET: 'sdk-secret' })[key] };

test('PKCE callback, encryption, user isolation, host signing and duplicate create prevention', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hireos-zoom-host-'));
  const service = new ZoomHostService(config, new MeetingsService(config)); service.directory = directory;
  let tokenParameters; let creates = 0;
  service.token = async parameters => { tokenParameters = parameters; return { access_token: 'private-access', refresh_token: 'private-refresh', expires_in: 3600 }; };
  service.call = async url => {
    if (url.endsWith('/users/me')) return { id: 'zoom-user', display_name: 'Test host' };
    if (url.endsWith('/meetings')) { creates++; return { id: 12345678901, password: 'private-passcode', join_url: 'https://zoom.us/j/12345678901' }; }
    if (url.endsWith('/zak')) return { token: 'private-zak' };
    throw new Error('Unexpected endpoint');
  };
  try {
    const { authorizationUrl } = await service.authorize(identity);
    const url = new URL(authorizationUrl); const callback = new URL(url.searchParams.get('redirect_uri'));
    assert.equal(callback.hostname, '127.0.0.1'); assert.notEqual(callback.port, '');
    callback.search = new URLSearchParams({ state: 'wrong', code: 'code' });
    assert.equal((await fetch(callback)).status, 400);
    callback.searchParams.set('state', url.searchParams.get('state'));
    assert.equal((await fetch(callback)).status, 200);
    assert.equal(createHash('sha256').update(tokenParameters.code_verifier).digest('base64url'), url.searchParams.get('code_challenge'));
    assert.equal((await service.status(identity)).connected, true);
    assert.equal((await service.status({ ...identity, actorId: 'other' })).connected, false);
    const [a, b] = await Promise.all([service.start(identity), service.start(identity)]);
    assert.equal(creates, 1); assert.equal(a.meetingNumber, b.meetingNumber);
    assert.equal(JSON.parse(Buffer.from(a.signature.split('.')[1], 'base64url')).role, 1);
    assert.equal(a.zak, 'private-zak');
    const publicStatus = JSON.stringify(await service.status(identity));
    for (const secret of ['private-access', 'private-refresh', 'private-zak', 'private-passcode']) assert.ok(!publicStatus.includes(secret));
    for (const file of await readdir(directory)) {
      const data = await readFile(join(directory, file));
      assert.ok(!data.includes(Buffer.from('private-access'))); assert.ok(!data.includes(Buffer.from('private-zak')));
    }
    await assert.rejects(service.start({ ...identity, actorId: 'other' }), error => error.getResponse().code === 'ZOOM_CONNECT_REQUIRED');
  } finally { service.onModuleDestroy(); await rm(directory, { recursive: true, force: true }); }
});

test('missing public client and production fail closed', async () => {
  const missing = new ZoomHostService({ get: key => key === 'ZOOM_OAUTH_PUBLIC_CLIENT_ID' ? '' : config.get(key) }, new MeetingsService(config));
  await assert.rejects(missing.authorize(identity), error => error.getResponse().code === 'ZOOM_PUBLIC_CLIENT_ID_REQUIRED');
  const production = new ZoomHostService({ get: key => key === 'NODE_ENV' ? 'production' : config.get(key) }, new MeetingsService(config));
  await assert.rejects(production.authorize(identity), error => error.getResponse().code === 'ZOOM_DISABLED');
});

test('uncertain creation cannot create a second meeting on retry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hireos-zoom-uncertain-'));
  const service = new ZoomHostService(config, new MeetingsService(config)); service.directory = directory;
  let creates = 0;
  try {
    await service.save(service.owner(identity), { id: 'user', name: 'Host', clientId: 'public-id', access: 'access', refresh: 'refresh', expires: Date.now() + 3600000 });
    service.call = async () => { creates++; throw new Error('Network failed'); };
    await assert.rejects(service.start(identity));
    await assert.rejects(service.start(identity), error => error.getResponse().code === 'ZOOM_CREATE_UNCERTAIN_CHECK_ACCOUNT');
    assert.equal(creates, 1);
  } finally { service.onModuleDestroy(); await rm(directory, { recursive: true, force: true }); }
});
