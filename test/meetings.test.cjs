const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
require('reflect-metadata');
const { MeetingsService } = require('../dist/meetings/meetings.service');
const settings = { NODE_ENV: 'development', ZOOM_DEV_ENABLED: 'true', ZOOM_MEETING_SDK_CLIENT_ID: 'test-client', ZOOM_MEETING_SDK_CLIENT_SECRET: 'test-secret', ZOOM_DEV_MEETING_NUMBER: '12345678901', ZOOM_DEV_MEETING_PASSWORD: 'test-password' };
const service = (overrides = {}) => new MeetingsService({ get: key => ({ ...settings, ...overrides })[key] });
test('Zoom dev signing is attendee-only and cryptographically valid', () => {
  const result = service().joinConfig();
  const [header, payload, signature] = result.signature.split('.');
  const body = JSON.parse(Buffer.from(payload, 'base64url'));
  assert.equal(body.role, 0);
  assert.equal(body.mn, settings.ZOOM_DEV_MEETING_NUMBER);
  assert.equal(body.appKey, settings.ZOOM_MEETING_SDK_CLIENT_ID);
  assert.ok(body.exp - body.iat >= 1800);
  assert.equal(signature, createHmac('sha256', settings.ZOOM_MEETING_SDK_CLIENT_SECRET).update(`${header}.${payload}`).digest('base64url'));
  assert.equal(JSON.stringify(result).includes('test-secret'), false);
});
test('Zoom production and disabled modes fail closed', () => {
  for (const config of [{ NODE_ENV: 'production' }, { ZOOM_DEV_ENABLED: 'false' }]) {
    assert.throws(() => service(config).joinConfig(), e => e.getStatus() === 404);
  }
});
test('Zoom missing or malformed configuration fails without leaking secrets', () => {
  for (const config of [{ ZOOM_MEETING_SDK_CLIENT_SECRET: '' }, { ZOOM_DEV_MEETING_NUMBER: 'bad' }, { ZOOM_DEV_MEETING_PASSWORD: '' }]) {
    assert.throws(() => service(config).joinConfig(), e => e.getResponse().code === 'ZOOM_NOT_CONFIGURED');
  }
});
test('Zoom dev signature issuance is rate limited', () => {
  const instance = service();
  for (let i = 0; i < 10; i++) instance.joinConfig();
  assert.throws(() => instance.joinConfig(), e => e.getStatus() === 429);
});
