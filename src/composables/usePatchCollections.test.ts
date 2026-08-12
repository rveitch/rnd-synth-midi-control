import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RndPatch } from '../midi/rndProtocol';
import { usePatchCollections } from './usePatchCollections';

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.get(key) ?? null; },
    key(index) { return Array.from(values.keys())[index] ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, value); },
  };
}

function createPatch(seed: number): RndPatch {
  return {
    capturedAt: new Date(seed * 1_000).toISOString(),
    global: null,
    rawMessages: [[0xf0, seed % 128, 0xf7]],
    seed,
    tracks: [],
  };
}

describe('patch collections', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
  });

  it('keeps library patches when rolling history is cleared', () => {
    const collections = usePatchCollections();
    const patch = createPatch(42);
    collections.savePatch(patch);
    collections.addToLibrary(patch, 'The answer');
    collections.clearHistory();

    expect(collections.patchHistory.value).toEqual([]);
    expect(collections.patchLibrary.value).toMatchObject([
      { name: 'The answer', patch: { seed: 42 } },
    ]);
  });

  it('removes only the history copy of a library patch', () => {
    const collections = usePatchCollections();
    const patch = createPatch(84);
    collections.savePatch(patch);
    collections.addToLibrary(patch, 'Keep this one');
    collections.removeFromHistory(patch.seed);

    expect(collections.patchHistory.value).toEqual([]);
    expect(collections.patchLibrary.value[0]?.patch.seed).toBe(84);
  });

  it('caps history without evicting a library copy', () => {
    const collections = usePatchCollections();
    const firstPatch = createPatch(1);
    collections.addToLibrary(firstPatch, 'Keep me');
    for (let seed = 1; seed <= 101; seed += 1) collections.savePatch(createPatch(seed));

    expect(collections.patchHistory.value).toHaveLength(100);
    expect(collections.patchHistory.value.some((patch) => patch.seed === 1)).toBe(false);
    expect(collections.patchLibrary.value[0]?.patch.seed).toBe(1);
  });

  it('exports and imports history and library as separate formats', () => {
    const source = usePatchCollections();
    const patch = createPatch(73);
    source.savePatch(patch);
    source.addToLibrary(patch, 'Seventy three');
    const historyExport = source.exportHistory();
    const libraryExport = source.exportLibrary();

    localStorage.clear();
    const destination = usePatchCollections();
    expect(destination.importHistory(historyExport)).toBe(1);
    expect(destination.patchHistory.value[0]?.seed).toBe(73);
    expect(destination.patchLibrary.value).toEqual([]);
    expect(() => destination.importLibrary(historyExport)).toThrow('not a supported patch library');

    expect(destination.importLibrary(libraryExport)).toBe(1);
    expect(destination.patchLibrary.value[0]?.name).toBe('Seventy three');
  });

  it('normalizes legacy generic metadata fields on import', () => {
    const legacyPatch = {
      capturedAt: new Date(0).toISOString(),
      global: {
        raw: [2, 60, 1, 6, 13],
        scaleIndex: 13,
        tonicIndex: 6,
        valueA: 2,
        valueB: 60,
        valueC: 1,
      },
      rawMessages: [],
      seed: 3_607_040_585,
      tracks: [{
        engine: 'Subtractive',
        index: 0,
        raw: [0, 1, 2, ...Array.from('Subtractive', (character) => character.charCodeAt(0)), 0],
        valueA: 1,
        valueB: 2,
      }],
    };
    const exported = JSON.stringify({
      exportedAt: new Date(0).toISOString(),
      format: 'rnd-synth-patch-history',
      patches: [legacyPatch],
      version: 1,
    });

    const collections = usePatchCollections();
    expect(collections.importHistory(exported)).toBe(1);
    expect(collections.patchHistory.value[0]).toMatchObject({
      global: { patchMode: 2, rootWhenCaptured: 6, scaleIndex: 13, tempoBpm: 188 },
      tracks: [{ role: 1, roleVariant: 2 }],
    });
  });
});
