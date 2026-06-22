/** Geo/network metadata for an IP address. */
export interface GeoInfo {
  /** ISO 3166-1 alpha-2 country code, uppercase (e.g. `US`). */
  country?: string;
  /** Autonomous System Number, when known. */
  asn?: number;
  /** Whether the IP is a known Tor exit node. */
  tor?: boolean;
  /** Whether the IP belongs to a known VPN/proxy provider. */
  vpn?: boolean;
}

/**
 * Pluggable geo/threat lookup port. A concrete MaxMind/IPinfo/Cloudflare-backed
 * implementation is provided separately; the core only depends on this contract.
 */
export interface GeoProvider {
  lookup(ip: string): Promise<GeoInfo> | GeoInfo;
}
