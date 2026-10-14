import 'reflect-metadata';
import { Body, Controller, Get, Headers, HttpException, Inject, Module, Post, Req } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Pool } from 'mysql2/promise';
import { AuthError, AuthService } from './auth';
import { assertConfig, config } from './config';
import { makePool, migrate } from './db';
import { GameGateway, originAllowed } from './gateway';
import { RateLimiter } from './rateLimit';
import { RoomService } from './rooms';

const POOL = 'DB_POOL';
const authLimit = new RateLimiter(20, 60_000); // per IP: register + login attempts per minute

const ipOf = (req: { headers: Record<string, string | string[] | undefined>; ip?: string }) =>
  String(req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'] ?? req.ip ?? 'unknown').split(',')[0].trim();

const fail = (e: unknown): never => {
  if (e instanceof AuthError) throw new HttpException(e.message, e.status);
  throw e;
};

@Controller('api')
class AppController {
  constructor(@Inject(AuthService) private auth: AuthService, @Inject(POOL) private pool: Pool) {}

  @Get('health')
  async health() {
    await this.pool.query('SELECT 1');
    return { status: 'ok' };
  }

  @Post('auth/register')
  async register(@Body() body: { displayName?: unknown; password?: unknown }, @Req() req: any) {
    if (!authLimit.take(ipOf(req))) throw new HttpException('Thử quá nhiều lần, đợi một chút nhé.', 429);
    try {
      return await this.auth.register(body?.displayName, body?.password);
    } catch (e) {
      return fail(e);
    }
  }

  @Post('auth/login')
  async login(@Body() body: { username?: unknown; password?: unknown }, @Req() req: any) {
    if (!authLimit.take(ipOf(req))) throw new HttpException('Thử quá nhiều lần, đợi một chút nhé.', 429);
    try {
      return await this.auth.login(body?.username, body?.password);
    } catch (e) {
      return fail(e);
    }
  }

  @Get('me')
  me(@Headers('authorization') h?: string) {
    const user = this.auth.verify(h?.replace(/^Bearer /, ''));
    if (!user) throw new HttpException('Cần đăng nhập.', 401);
    return { user };
  }
}

export async function createApp(opts: { pool?: Pool; migrate?: boolean } = {}) {
  assertConfig();
  const p = opts.pool ?? makePool();
  if (opts.migrate !== false) await migrate(p);

  @Module({
    controllers: [AppController],
    providers: [
      { provide: POOL, useValue: p },
      { provide: AuthService, useValue: new AuthService(p) },
      { provide: RoomService, useValue: new RoomService() },
      GameGateway,
    ],
  })
  class AppModule {}

  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.enableCors({ origin: (o: string | undefined, cb: (e: Error | null, ok: boolean) => void) => cb(null, originAllowed(o)) });
  return { app, pool: p };
}

async function bootstrap() {
  const { app } = await createApp();
  await app.listen(config.port, config.host);
  console.log(`cangoctoado-server listening on http://${config.host}:${config.port}`);
}

if (require.main === module) {
  bootstrap().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
