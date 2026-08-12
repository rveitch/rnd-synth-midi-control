import { ref } from 'vue';
import { decodeSevenBitLittleEndian, type RndGlobalMetadata, type RndPatch, type RndTrackMetadata } from '../midi/rndProtocol';

const HISTORY_STORAGE_KEY = 'rnd-synth-midi-control.patch-history.v1';
const LIBRARY_STORAGE_KEY = 'rnd-synth-midi-control.patch-library.v1';
const MAX_HISTORY_LENGTH = 100;

export interface LibraryPatch {
  addedAt: string;
  name: string;
  patch: RndPatch;
}

interface HistoryExport {
  exportedAt: string;
  format: 'rnd-synth-patch-history';
  patches: RndPatch[];
  version: 1;
}

interface LibraryExport {
  entries: LibraryPatch[];
  exportedAt: string;
  format: 'rnd-synth-patch-library';
  version: 1;
}

function normalizeGlobalMetadata(value: unknown): RndGlobalMetadata | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Partial<RndGlobalMetadata> & {
    tonicIndex?: unknown;
    valueA?: unknown;
  };
  if (!Array.isArray(candidate.raw) || candidate.raw.length !== 5) return null;
  const raw = candidate.raw.map(Number) as RndGlobalMetadata['raw'];
  if (raw.some((byte) => !Number.isInteger(byte))) return null;
  const patchMode = typeof candidate.patchMode === 'number' ? candidate.patchMode : Number(candidate.valueA ?? raw[0]);
  const rootWhenCaptured = typeof candidate.rootWhenCaptured === 'number'
    ? candidate.rootWhenCaptured
    : Number(candidate.tonicIndex ?? raw[3]);
  const scaleIndex = typeof candidate.scaleIndex === 'number' ? candidate.scaleIndex : raw[4];
  const tempoBpm = typeof candidate.tempoBpm === 'number'
    ? candidate.tempoBpm
    : decodeSevenBitLittleEndian(raw.slice(1, 3));
  if (![patchMode, rootWhenCaptured, scaleIndex, tempoBpm].every(Number.isInteger)) return null;
  return { patchMode, raw, rootWhenCaptured, scaleIndex, tempoBpm };
}

function normalizeTrackMetadata(value: unknown): RndTrackMetadata | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Partial<RndTrackMetadata> & { valueA?: unknown; valueB?: unknown };
  if (typeof candidate.engine !== 'string' || !Number.isInteger(candidate.index) || !Array.isArray(candidate.raw)) {
    return null;
  }
  const role = typeof candidate.role === 'number' ? candidate.role : Number(candidate.valueA ?? candidate.raw[1]);
  const roleVariant = typeof candidate.roleVariant === 'number'
    ? candidate.roleVariant
    : Number(candidate.valueB ?? candidate.raw[2]);
  if (!Number.isInteger(role) || !Number.isInteger(roleVariant)) return null;
  return {
    engine: candidate.engine,
    index: candidate.index as number,
    raw: candidate.raw.map(Number),
    role,
    roleVariant,
  };
}

function normalizeStoredPatch(value: unknown): RndPatch | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Partial<RndPatch>;
  if (
    typeof candidate.capturedAt !== 'string' ||
    !Number.isSafeInteger(candidate.seed) ||
    !Array.isArray(candidate.rawMessages) ||
    !Array.isArray(candidate.tracks)
  ) return null;
  const tracks = candidate.tracks.map(normalizeTrackMetadata);
  if (tracks.some((track) => track === null)) return null;
  const global = candidate.global === null ? null : normalizeGlobalMetadata(candidate.global);
  if (candidate.global !== null && global === null) return null;
  return {
    capturedAt: candidate.capturedAt,
    global,
    rawMessages: candidate.rawMessages.map((message) => [...message]),
    seed: candidate.seed as number,
    tracks: tracks as RndTrackMetadata[],
  };
}

function normalizeLibraryPatch(value: unknown): LibraryPatch | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Partial<LibraryPatch>;
  if (
    typeof candidate.addedAt !== 'string' ||
    typeof candidate.name !== 'string' ||
    candidate.name.trim() === ''
  ) return null;
  const patch = normalizeStoredPatch(candidate.patch);
  return patch === null ? null : { addedAt: candidate.addedAt, name: candidate.name, patch };
}

function parseJson(serialized: string): unknown {
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
}

function loadStoredArray<T>(key: string, normalize: (value: unknown) => T | null): T[] {
  try {
    const serialized = localStorage.getItem(key);
    if (serialized === null) return [];
    const parsed: unknown = JSON.parse(serialized);
    return Array.isArray(parsed)
      ? parsed.map(normalize).filter((value): value is T => value !== null)
      : [];
  } catch {
    return [];
  }
}

function uniquePatches(patches: RndPatch[]): RndPatch[] {
  const seeds = new Set<number>();
  return patches.filter((patch) => {
    if (seeds.has(patch.seed)) return false;
    seeds.add(patch.seed);
    return true;
  });
}

function uniqueLibraryEntries(entries: LibraryPatch[]): LibraryPatch[] {
  const seeds = new Set<number>();
  return entries.filter((entry) => {
    if (seeds.has(entry.patch.seed)) return false;
    seeds.add(entry.patch.seed);
    return true;
  });
}

export function usePatchCollections() {
  const patchHistory = ref<RndPatch[]>(
    loadStoredArray(HISTORY_STORAGE_KEY, normalizeStoredPatch).slice(0, MAX_HISTORY_LENGTH),
  );
  const patchLibrary = ref<LibraryPatch[]>(loadStoredArray(LIBRARY_STORAGE_KEY, normalizeLibraryPatch));

  function savePatch(patch: RndPatch): void {
    patchHistory.value = uniquePatches([patch, ...patchHistory.value]).slice(0, MAX_HISTORY_LENGTH);
    persistHistory();

    const libraryIndex = patchLibrary.value.findIndex((entry) => entry.patch.seed === patch.seed);
    if (libraryIndex >= 0) {
      patchLibrary.value = patchLibrary.value.map((entry, index) =>
        index === libraryIndex ? { ...entry, patch } : entry,
      );
      persistLibrary();
    }
  }

  function addToLibrary(patch: RndPatch, requestedName: string): void {
    const existing = patchLibrary.value.find((entry) => entry.patch.seed === patch.seed);
    const name = requestedName.trim() || existing?.name || `Patch ${patch.seed}`;
    const entry: LibraryPatch = {
      addedAt: existing?.addedAt ?? new Date().toISOString(),
      name,
      patch,
    };
    patchLibrary.value = [entry, ...patchLibrary.value.filter((item) => item.patch.seed !== patch.seed)];
    persistLibrary();
  }

  function renameLibraryPatch(seed: number, requestedName: string): void {
    const name = requestedName.trim();
    if (name === '') throw new Error('Library patch names cannot be empty.');
    patchLibrary.value = patchLibrary.value.map((entry) =>
      entry.patch.seed === seed ? { ...entry, name } : entry,
    );
    persistLibrary();
  }

  function removeFromLibrary(seed: number): void {
    patchLibrary.value = patchLibrary.value.filter((entry) => entry.patch.seed !== seed);
    persistLibrary();
  }

  function clearHistory(): void {
    patchHistory.value = [];
    persistHistory();
  }

  function removeFromHistory(seed: number): void {
    patchHistory.value = patchHistory.value.filter((patch) => patch.seed !== seed);
    persistHistory();
  }

  function exportHistory(): string {
    const document: HistoryExport = {
      exportedAt: new Date().toISOString(),
      format: 'rnd-synth-patch-history',
      patches: patchHistory.value,
      version: 1,
    };
    return JSON.stringify(document, null, 2);
  }

  function exportLibrary(): string {
    const document: LibraryExport = {
      entries: patchLibrary.value,
      exportedAt: new Date().toISOString(),
      format: 'rnd-synth-patch-library',
      version: 1,
    };
    return JSON.stringify(document, null, 2);
  }

  function importHistory(serialized: string): number {
    const parsed = parseJson(serialized);
    if (typeof parsed !== 'object' || parsed === null) throw new Error('This is not a patch history export.');
    const candidate = parsed as Partial<HistoryExport>;
    if (candidate.format !== 'rnd-synth-patch-history' || candidate.version !== 1 || !Array.isArray(candidate.patches)) {
      throw new Error('This is not a supported patch history export.');
    }
    const imported = candidate.patches.map(normalizeStoredPatch);
    if (imported.some((patch) => patch === null)) throw new Error('The history export contains invalid patches.');
    const normalized = imported as RndPatch[];
    patchHistory.value = uniquePatches([...normalized, ...patchHistory.value]).slice(0, MAX_HISTORY_LENGTH);
    persistHistory();
    return imported.length;
  }

  function importLibrary(serialized: string): number {
    const parsed = parseJson(serialized);
    if (typeof parsed !== 'object' || parsed === null) throw new Error('This is not a patch library export.');
    const candidate = parsed as Partial<LibraryExport>;
    if (candidate.format !== 'rnd-synth-patch-library' || candidate.version !== 1 || !Array.isArray(candidate.entries)) {
      throw new Error('This is not a supported patch library export.');
    }
    const imported = candidate.entries.map(normalizeLibraryPatch);
    if (imported.some((entry) => entry === null)) throw new Error('The library export contains invalid entries.');
    patchLibrary.value = uniqueLibraryEntries([...(imported as LibraryPatch[]), ...patchLibrary.value]);
    persistLibrary();
    return imported.length;
  }

  function persistHistory(): void {
    persist(HISTORY_STORAGE_KEY, patchHistory.value);
  }

  function persistLibrary(): void {
    persist(LIBRARY_STORAGE_KEY, patchLibrary.value);
  }

  function persist(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // MIDI capture and recall should continue when browser storage is unavailable or full.
    }
  }

  return {
    addToLibrary,
    clearHistory,
    exportHistory,
    exportLibrary,
    importHistory,
    importLibrary,
    patchHistory,
    patchLibrary,
    removeFromHistory,
    removeFromLibrary,
    renameLibraryPatch,
    savePatch,
  };
}
