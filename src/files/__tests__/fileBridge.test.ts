import {
  describe, it, expect, beforeEach, afterEach, vi,
} from 'vitest';

/** A stand-in for the browser's EventSource that records what was opened and lets tests push events. */
class FakeSource {
  static opened: FakeSource[] = [];

  closed = false;

  onmessage: ((e: { data: string }) => void) | null = null;

  constructor (public readonly url: string) {
    FakeSource.opened.push(this);
  }

  close (): void {
    this.closed = true;
  }

  emit (data: string): void {
    this.onmessage?.({ data });
  }
}

const live = () => FakeSource.opened.filter((s) => !s.closed);
const pathsOf = (s: FakeSource) => new URL(s.url, 'http://x').searchParams.getAll('path');
const tick = () => new Promise<void>((r) => queueMicrotask(r));

const { fileBridge } = await import('@/files/fileBridge');

describe('fileBridge.watch', () => {
  beforeEach(() => {
    FakeSource.opened = [];
    vi.stubGlobal('EventSource', FakeSource);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves every watched file over one stream, routes events by path, and reopens as the set changes', async () => {
    const a = vi.fn();
    const b = vi.fn();
    const b2 = vi.fn();
    const stopA = fileBridge.watch('/repo/a.dbml', a);
    const stopB = fileBridge.watch('/repo/b.dbml', b);
    const stopB2 = fileBridge.watch('/repo/b.dbml', b2);
    expect(FakeSource.opened).toHaveLength(0);
    await tick();
    // One connection for both files, opened once for the whole batch.
    expect(live()).toHaveLength(1);
    expect(pathsOf(live()[0]!)).toEqual(['/repo/a.dbml', '/repo/b.dbml']);

    live()[0]!.emit(JSON.stringify({ path: '/repo/b.dbml', mtimeMs: 2, exists: true }));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    expect(b2).toHaveBeenCalledTimes(1);
    live()[0]!.emit('not json');
    live()[0]!.emit(JSON.stringify({ mtimeMs: 3 }));
    expect(b).toHaveBeenCalledTimes(1);

    // Dropping one of two listeners on a file keeps the stream as it is.
    stopB2();
    await tick();
    expect(FakeSource.opened).toHaveLength(1);

    // Dropping the last listener on a file reopens the stream without it.
    stopA();
    await tick();
    expect(FakeSource.opened).toHaveLength(2);
    expect(FakeSource.opened[0]!.closed).toBe(true);
    expect(pathsOf(live()[0]!)).toEqual(['/repo/b.dbml']);
    live()[0]!.emit(JSON.stringify({ path: '/repo/a.dbml', mtimeMs: 4, exists: true }));
    expect(a).not.toHaveBeenCalled();

    // Nothing left to watch: no stream at all.
    stopB();
    stopB();
    await tick();
    expect(live()).toHaveLength(0);
    expect(FakeSource.opened).toHaveLength(2);
  });
});
