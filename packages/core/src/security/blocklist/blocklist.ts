import type { KeyValueStore } from '../../interfaces/store';
import { MemoryStore } from '../../cache/memory-store';
import { ipInAny, normalizeIp } from '../../utils/ip';

export interface IpBlocklistOptions {
  /** Permanently blocked IPs/CIDRs (IPv4 + IPv6). */
  permanent?: string[];
  /** Allowlisted IPs/CIDRs — always permitted, checked first. */
  allow?: string[];
  /** Store for temporary (TTL) blocks; enables distributed blocking. */
  store?: KeyValueStore;
  /** Key prefix for temp blocks in the store (default `block:`). */
  keyPrefix?: string;
}

/**
 * IP blocklist supporting allowlists, permanent CIDR rules, and temporary
 * TTL-based blocks backed by a {@link KeyValueStore} (so bans propagate across
 * instances). IPv4 and IPv6 with CIDR ranges are supported.
 */
export class IpBlocklist {
  private readonly permanent: Set<string>;
  private readonly allow: string[];
  private readonly store: KeyValueStore;
  private readonly prefix: string;

  constructor(options: IpBlocklistOptions = {}) {
    this.permanent = new Set(options.permanent ?? []);
    this.allow = options.allow ?? [];
    this.store = options.store ?? new MemoryStore();
    this.prefix = options.keyPrefix ?? 'block:';
  }

  async isBlocked(ip: string): Promise<boolean> {
    const norm = normalizeIp(ip);
    if (this.allow.length && ipInAny(norm, this.allow)) return false;
    if (ipInAny(norm, this.permanent)) return true;
    return (await this.store.get<number>(this.prefix + norm)) !== null;
  }

  /** Block an IP. With `ttlMs`, the block expires; otherwise it is permanent. */
  async block(ip: string, ttlMs?: number): Promise<void> {
    const norm = normalizeIp(ip);
    if (ttlMs && ttlMs > 0) {
      await this.store.set(this.prefix + norm, 1, ttlMs);
    } else {
      this.permanent.add(norm);
    }
  }

  async unblock(ip: string): Promise<void> {
    const norm = normalizeIp(ip);
    this.permanent.delete(norm);
    await this.store.delete(this.prefix + norm);
  }

  /** Snapshot of permanent entries (CIDRs + explicit IPs). */
  listPermanent(): string[] {
    return [...this.permanent];
  }
}
