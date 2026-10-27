import { timingSafeEqual } from 'node:crypto';
import { Body, CanActivate, Controller, Delete, ExecutionContext, Get, HttpException, Inject, Injectable, Param, Put, Query, UseGuards } from '@nestjs/common';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { AuthError, cleanDisplayName } from './auth';
import { config } from './config';
import { POOL } from './db';

// "Admin contract" v1 of the shared hub (admin.baodom.xyz): see admin-hub/AGENT.md in the bangach_en repo.
// The hub calls this from inside the Docker network; Caddy never forwards /admin-api to the internet.
const CONTRACT_VERSION = 1;
const GAME = { key: 'cangoctoado', name: 'Căn Góc Tọa Độ', version: process.env.APP_VERSION ?? '0.1.0' };

const bad = (status: number, code: string, message: string, fields?: { name: string; message: string }[]) =>
  new HttpException({ error: { code, message, ...(fields ? { fields } : {}) } }, status);

@Injectable()
class AdminTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const expected = Buffer.from(config.adminApiToken);
    if (expected.length < 32) throw bad(401, 'unauthorized', 'Chưa cấu hình token quản trị.');
    // a proxy hop (Cloudflare/Caddy) leaves these headers; the hub talks to us directly
    if (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']) throw bad(401, 'unauthorized', 'Không nhận yêu cầu đi qua proxy.');
    const given = Buffer.from((req.headers.authorization ?? '').replace(/^Bearer /, ''));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw bad(401, 'unauthorized', 'Sai hoặc thiếu token.');
    return true;
  }
}

const META = {
  game: GAME,
  contractVersion: CONTRACT_VERSION,
  resources: [
    {
      key: 'users',
      label: 'Người chơi',
      kind: 'collection',
      primaryKey: 'id',
      allowCreate: false,
      allowDelete: true,
      actions: [],
      fields: [
        { name: 'id', label: 'ID', type: 'int', required: false, unique: true, readonly: true, list: true, filter: false, search: false, sortable: true },
        { name: 'username', label: 'Tên đăng nhập', type: 'string', required: false, unique: true, readonly: true, list: true, filter: false, search: true, sortable: true },
        { name: 'displayName', label: 'Tên hiển thị', type: 'string', required: true, unique: false, readonly: false, list: true, filter: false, search: true, sortable: true, maxLength: 24 },
        { name: 'createdAt', label: 'Ngày tạo', type: 'datetime', required: false, unique: false, readonly: true, list: true, filter: false, search: false, sortable: true },
      ],
    },
  ],
};

const SORT_COLUMNS: Record<string, string> = { id: 'id', username: 'username', displayName: 'display_name', createdAt: 'created_at' };
const SELECT = 'SELECT id, username, display_name AS displayName, created_at AS createdAt FROM users';

const csvCell = (v: unknown) => {
  const s = v instanceof Date ? v.toISOString() : String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

@Controller('admin-api')
@UseGuards(AdminTokenGuard)
export class AdminApiController {
  constructor(@Inject(POOL) private pool: Pool) {}

  @Get('meta')
  meta() {
    return META;
  }

  @Get('health')
  async health() {
    let db: 'up' | 'down' = 'up';
    try {
      await this.pool.query('SELECT 1');
    } catch {
      db = 'down';
    }
    return { status: db === 'up' ? 'ok' : 'error', version: GAME.version, contractVersion: CONTRACT_VERSION, uptimeSec: Math.round(process.uptime()), rssMb: Math.round(process.memoryUsage().rss / 1048576), db };
  }

  // `export` must be declared before `:id` so it is not read as an id
  @Get(':resource/export')
  async export(@Param('resource') resource: string, @Query('format') format = 'json') {
    this.need(resource);
    if (format !== 'csv' && format !== 'json') throw bad(422, 'validation', 'format phải là csv hoặc json.');
    const [rows] = await this.pool.query<RowDataPacket[]>(`${SELECT} ORDER BY id`);
    const content =
      format === 'json'
        ? JSON.stringify(rows, null, 2)
        : [['id', 'username', 'displayName', 'createdAt'].join(','), ...rows.map((r) => [r.id, r.username, r.displayName, r.createdAt].map(csvCell).join(','))].join('\n');
    return { format, filename: `users.${format}`, count: rows.length, content };
  }

  @Get(':resource')
  async list(
    @Param('resource') resource: string,
    @Query('page') pageQ?: string,
    @Query('pageSize') sizeQ?: string,
    @Query('sort') sortQ?: string,
    @Query('q') q?: string,
  ) {
    this.need(resource);
    const page = Math.max(1, Math.floor(Number(pageQ)) || 1);
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(sizeQ)) || 20));
    const [sortField, dir] = (sortQ ?? 'id:desc').split(':');
    const column = SORT_COLUMNS[sortField];
    if (!column) throw bad(422, 'validation', `Không sắp xếp được theo "${sortField}".`);
    const where = q ? ' WHERE username LIKE ? OR display_name LIKE ?' : '';
    const args = q ? [`%${q}%`, `%${q}%`] : [];
    const [[count]] = await this.pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM users${where}`, args);
    const [items] = await this.pool.query<RowDataPacket[]>(`${SELECT}${where} ORDER BY ${column} ${dir === 'asc' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`, [...args, pageSize, (page - 1) * pageSize]);
    return { items, total: Number(count.n), page, pageSize };
  }

  @Get(':resource/:id')
  async one(@Param('resource') resource: string, @Param('id') id: string) {
    this.need(resource);
    return this.find(id);
  }

  @Put(':resource/:id')
  async update(@Param('resource') resource: string, @Param('id') id: string, @Body() body: { displayName?: unknown }) {
    this.need(resource);
    await this.find(id);
    let displayName: string;
    try {
      displayName = cleanDisplayName(body?.displayName);
    } catch (e) {
      if (e instanceof AuthError) throw bad(422, 'validation', e.message, [{ name: 'displayName', message: e.message }]);
      throw e;
    }
    await this.pool.execute('UPDATE users SET display_name = ? WHERE id = ?', [displayName, id]);
    return this.find(id);
  }

  @Delete(':resource/:id')
  async remove(@Param('resource') resource: string, @Param('id') id: string) {
    this.need(resource);
    const [r] = await this.pool.execute<ResultSetHeader>('DELETE FROM users WHERE id = ?', [id]);
    if (!r.affectedRows) throw bad(404, 'not_found', 'Không có người chơi này.');
    return { ok: true };
  }

  private need(resource: string) {
    if (resource !== 'users') throw bad(404, 'not_found', `Không có tài nguyên "${resource}".`);
  }

  private async find(id: string) {
    if (!/^\d+$/.test(id)) throw bad(404, 'not_found', 'Không có người chơi này.');
    const [rows] = await this.pool.query<RowDataPacket[]>(`${SELECT} WHERE id = ?`, [id]);
    if (!rows[0]) throw bad(404, 'not_found', 'Không có người chơi này.');
    return rows[0];
  }
}
