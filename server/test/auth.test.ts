// REST auth against the real MariaDB (database cangoctoado_test). Run: npm run test:auth (loads .env)
process.env.DB_NAME = (process.env.DB_NAME ?? 'cangoctoado').replace(/_test$/, '') + '_test';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import type { Pool } from 'mysql2/promise';
import { createApp } from '../src/main';

let app: INestApplication;
let pool: Pool;
let base = '';

before(async () => {
  const made = await createApp();
  app = made.app;
  pool = made.pool;
  await pool.query('DELETE FROM users');
  await app.listen(0, '127.0.0.1');
  base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
});
after(async () => {
  await pool.query('DELETE FROM users');
  await app.close();
  await pool.end();
});

const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('health', async () => {
  assert.equal((await fetch(base + '/api/health')).status, 200);
});

test('AC1: same display name twice -> two different usernames; password is hashed', async () => {
  const r1 = await (await post('/api/auth/register', { displayName: 'Nguyễn Văn Đạt', password: 'matkhau123' })).json();
  const r2 = await (await post('/api/auth/register', { displayName: 'Nguyễn Văn Đạt', password: 'matkhau456' })).json();
  assert.match(r1.user.username, /^nguyenvandat-\d{4,6}$/);
  assert.notEqual(r1.user.username, r2.user.username);
  assert.ok(r1.token && r2.token);
  const [rows] = (await pool.query('SELECT password_hash FROM users WHERE username = ?', [r1.user.username])) as any;
  assert.match(rows[0].password_hash, /^\$argon2id\$/);
  assert.ok(!JSON.stringify(r1).includes('argon2'));
});

test('login: right password ok, wrong / unknown rejected with the same message', async () => {
  const reg = await (await post('/api/auth/register', { displayName: 'Lan', password: 'abcdef' })).json();
  const ok = await post('/api/auth/login', { username: reg.user.username.toUpperCase(), password: 'abcdef' });
  assert.equal(ok.status, 201);
  const me = await fetch(base + '/api/me', { headers: { Authorization: `Bearer ${(await ok.json()).token}` } });
  assert.equal((await me.json()).user.displayName, 'Lan');
  const bad = await post('/api/auth/login', { username: reg.user.username, password: 'wrong!' });
  const none = await post('/api/auth/login', { username: 'khongco-0000', password: 'abcdef' });
  assert.equal(bad.status, 401);
  assert.equal(none.status, 401);
  assert.equal((await bad.json()).message, (await none.json()).message);
  assert.equal((await fetch(base + '/api/me')).status, 401);
});

test('validation: short password / empty name rejected', async () => {
  assert.equal((await post('/api/auth/register', { displayName: 'X', password: '123' })).status, 400);
  assert.equal((await post('/api/auth/register', { displayName: '   ', password: '123456' })).status, 400);
  assert.equal((await post('/api/auth/register', { displayName: '<b>', password: '123456' })).status, 400);
});
