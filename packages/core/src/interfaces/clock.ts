/**
 * Injectable time source. Enables deterministic tests by allowing a fake clock
 * to be substituted for the system clock.
 */
export interface Clock {
  /** Current time in milliseconds since the Unix epoch. */
  now(): number;
}

/** Default clock backed by `Date.now()`. */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}
