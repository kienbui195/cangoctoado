const num = (v: string | undefined, d: number) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 45215),
  host: process.env.HOST ?? '127.0.0.1',
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: num(process.env.DB_PORT, 3306),
    database: process.env.DB_NAME ?? 'cangoctoado',
    user: process.env.DB_USER ?? 'cangoctoado',
    password: process.env.DB_PASSWORD ?? '',
  },
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtDays: num(process.env.JWT_DAYS, 7),
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  /** a room with fewer than 2 connected people is deleted after this long */
  aloneTtlMs: num(process.env.ALONE_TTL_MS, 5 * 60_000),
  /** a player who stays disconnected this long during a match loses it */
  awayForfeitMs: num(process.env.AWAY_FORFEIT_MS, 20_000),
  /** test only: simulate the match this many times faster */
  gameSpeed: num(process.env.GAME_SPEED, 1),
};

export function assertConfig() {
  if (config.jwtSecret.length < 32) throw new Error('JWT_SECRET must be set (at least 32 characters).');
}
