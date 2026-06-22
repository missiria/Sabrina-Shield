import { describe, it, expect } from 'vitest';
import { MemoryStore } from './memory-store';

describe('MemoryStore — windowed counter', () => {
  it('increments within a window and resets after it', async () => {
    const store = new MemoryStore();
    const a = await store.hit('k', 1000, 1, 0);
    expect(a.count).toBe(1);
    expect(a.resetAt).toBe(1000);
    const b = await store.hit('k', 1000, 1, 500);
    expect(b.count).toBe(2);
    expect(b.resetAt).toBe(1000);
    // after window expiry, counter restarts
    const c = await store.hit('k', 1000, 1, 1001);
    expect(c.count).toBe(1);
    expect(c.resetAt).toBe(2001);
  });

  it('read returns 0 for missing/expired keys', async () => {
    const store = new MemoryStore();
    expect(await store.read('missing', 0)).toBe(0);
    await store.hit('k', 1000, 3, 0);
    expect(await store.read('k', 500)).toBe(3);
    expect(await store.read('k', 2000)).toBe(0);
  });
});

describe('MemoryStore — bucket', () => {
  it('drips and persists state across calls', async () => {
    const store = new MemoryStore();
    const p = { capacity: 5, refillPerMs: 5 / 1000, cost: 1, nowMs: 0 };
    const first = await store.drip('b', p);
    expect(first.remaining).toBe(4);
    const second = await store.drip('b', { ...p, nowMs: 0 });
    expect(second.remaining).toBe(3);
  });
});

describe('MemoryStore — KeyValueStore', () => {
  it('set/get with TTL expiry', async () => {
    const store = new MemoryStore();
    await store.set('x', { a: 1 }, 10_000);
    expect(await store.get('x')).toEqual({ a: 1 });
    await store.set('y', 'v', -1); // already expired window guarded => no expiry path
    expect(await store.get('y')).toBe('v');
  });

  it('increment counter accumulates', async () => {
    const store = new MemoryStore();
    expect(await store.increment('c')).toBe(1);
    expect(await store.increment('c', 4)).toBe(5);
  });

  it('reset clears all namespaces for a key', async () => {
    const store = new MemoryStore();
    await store.hit('k', 1000, 1, 0);
    await store.set('k', 'v');
    await store.reset('k');
    expect(await store.read('k', 0)).toBe(0);
    expect(await store.get('k')).toBeNull();
  });

  it('sweep removes expired entries', async () => {
    const store = new MemoryStore();
    await store.hit('k', 100, 1, 0);
    store.sweep(1000);
    expect(await store.read('k', 0)).toBe(0);
  });
});
