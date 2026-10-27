// /admin-api contract checks against the real Nest app and a fake pool (no database needed).
import './env';
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/main';

const rows = [{ id: 1, username: 'an-0001', displayName: 'An', createdAt: new Date('2026-10-01T00:00:00Z') }];
const pool = {
  query: async (sql: string) => [/COUNT/.test(sql) ? [{ n: 1 }] : rows],
  execute: async () => [{ affectedRows: 1 }],
};
let app: INestApplication;
let url = '';
const auth = { authorization: `Bearer ${process.env.ADMIN_API_TOKEN}` };
const get = (path: string, headers: Record<string, string> = auth) => fetch(url + path, { headers });

before(async () => {
  app = (await createApp({ pool: pool as any, migrate: false })).app;
  await app.listen(0, '127.0.0.1');
  url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
});
after(() => app.close());

test('refuses a missing or wrong token', async () => {
  assert.equal((await get('/admin-api/meta', {})).status, 401);
  assert.equal((await get('/admin-api/meta', { authorization: 'Bearer nope' })).status, 401);
});

test('refuses requests that came through a proxy', async () => {
  assert.equal((await get('/admin-api/meta', { ...auth, 'x-forwarded-for': '1.2.3.4' })).status, 401);
  assert.equal((await get('/admin-api/meta', { ...auth, 'cf-connecting-ip': '1.2.3.4' })).status, 401);
});

test('meta and health follow the contract', async () => {
  const meta = await (await get('/admin-api/meta')).json();
  assert.equal(meta.contractVersion, 1);
  assert.equal(meta.game.key, 'cangoctoado');
  assert.equal(meta.resources[0].key, 'users');
  const health = await (await get('/admin-api/health')).json();
  assert.equal(health.status, 'ok');
  assert.equal(health.db, 'up');
});

test('list, export, validation and unknown resource', async () => {
  const list = await (await get('/admin-api/users?page=1&pageSize=10&sort=createdAt:desc&q=an')).json();
  assert.equal(list.total, 1);
  assert.equal(list.items[0].username, 'an-0001');
  assert.equal((await get('/admin-api/users?sort=password_hash:asc')).status, 422);
  const csv = await (await get('/admin-api/users/export?format=csv')).json();
  assert.equal(csv.count, 1);
  assert.match(csv.content, /^id,username,displayName,createdAt\n1,an-0001,An,/);
  assert.equal((await get('/admin-api/rooms')).status, 404);
  const put = await fetch(`${url}/admin-api/users/1`, { method: 'PUT', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ displayName: '' }) });
  assert.equal(put.status, 422);
  assert.equal((await put.json()).error.fields[0].name, 'displayName');
});
