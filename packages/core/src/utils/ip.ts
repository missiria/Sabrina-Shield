/**
 * IPv4/IPv6 parsing and CIDR matching with no external dependencies.
 * Addresses are converted to a fixed-width BigInt so v4 and v6 share one path.
 */

export type IpVersion = 4 | 6;

export interface ParsedIp {
  version: IpVersion;
  /** Numeric value: 32-bit for v4, 128-bit for v6. */
  value: bigint;
}

function parseIpv4(ip: string): bigint | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = (value << 8n) | BigInt(n);
  }
  return value;
}

function parseIpv6(ip: string): bigint | null {
  // Strip zone id (e.g. fe80::1%eth0).
  const zone = ip.indexOf('%');
  if (zone !== -1) ip = ip.slice(0, zone);

  // Handle embedded IPv4 (e.g. ::ffff:192.168.0.1).
  const lastColon = ip.lastIndexOf(':');
  if (ip.includes('.') && lastColon !== -1) {
    const v4 = parseIpv4(ip.slice(lastColon + 1));
    if (v4 === null) return null;
    const hi = (v4 >> 16n) & 0xffffn;
    const lo = v4 & 0xffffn;
    ip = `${ip.slice(0, lastColon + 1)}${hi.toString(16)}:${lo.toString(16)}`;
  }

  const halves = ip.split('::');
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];

  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill('0'), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;

  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

/** Parse an IP string to {@link ParsedIp}, or `null` if invalid. */
export function parseIp(ip: string): ParsedIp | null {
  const trimmed = ip.trim();
  if (trimmed.includes(':')) {
    const value = parseIpv6(trimmed);
    return value === null ? null : { version: 6, value };
  }
  const value = parseIpv4(trimmed);
  return value === null ? null : { version: 4, value };
}

/**
 * Normalize an IP. IPv4-mapped IPv6 (`::ffff:a.b.c.d`) collapses to its IPv4
 * form so a single client is keyed consistently regardless of transport.
 */
export function normalizeIp(ip: string): string {
  const parsed = parseIp(ip);
  if (!parsed) return ip.trim();
  if (parsed.version === 6) {
    const v4Mapped = 0xffffn << 32n;
    if ((parsed.value & ~0xffffffffn) === v4Mapped) {
      const v4 = parsed.value & 0xffffffffn;
      return [24n, 16n, 8n, 0n].map((s) => (v4 >> s) & 0xffn).join('.');
    }
  }
  return ip.trim();
}

/** Match an IP against a CIDR (e.g. `10.0.0.0/8`, `2001:db8::/32`) or a bare IP. */
export function ipInCidr(ip: string, cidr: string): boolean {
  const slash = cidr.indexOf('/');
  const network = slash === -1 ? cidr : cidr.slice(0, slash);
  const parsedIp = parseIp(ip);
  const parsedNet = parseIp(network);
  if (!parsedIp || !parsedNet) return false;
  if (parsedIp.version !== parsedNet.version) return false;

  const totalBits = parsedIp.version === 4 ? 32 : 128;
  const prefix = slash === -1 ? totalBits : Number(cidr.slice(slash + 1));
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > totalBits) return false;

  if (prefix === 0) return true;
  const shift = BigInt(totalBits - prefix);
  return parsedIp.value >> shift === parsedNet.value >> shift;
}

/** True if `ip` matches any CIDR/IP in the list. */
export function ipInAny(ip: string, cidrs: Iterable<string>): boolean {
  for (const cidr of cidrs) {
    if (ipInCidr(ip, cidr)) return true;
  }
  return false;
}
