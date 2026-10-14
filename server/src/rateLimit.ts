/** Sliding fixed-window counter keyed by anything (IP, socket id...). */
export class RateLimiter {
  private hits = new Map<string, { count: number; until: number }>();
  constructor(private max: number, private windowMs: number) {}

  /** true = allowed */
  take(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || h.until <= now) {
      this.hits.set(key, { count: 1, until: now + this.windowMs });
      if (this.hits.size > 5000) this.prune(now);
      return true;
    }
    h.count++;
    return h.count <= this.max;
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) if (v.until <= now) this.hits.delete(k);
  }
}

/** Token bucket for socket messages: `rate` per second, bursts up to `burst`. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(private rate: number, private burst: number, now = Date.now()) {
    this.tokens = burst;
    this.last = now;
  }
  take(now = Date.now()): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
