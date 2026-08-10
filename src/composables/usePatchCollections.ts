import { ref } from 'vue';
import type { RndPatch } from '../midi/rndProtocol';

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

function isStoredPatch(value: unknown): value is RndPatch {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<RndPatch>;
  return (
    typeof candidate.capturedAt === 'string' &&
    Number.isSafeInteger(candidate.seed) &&
    Array.isArray(candidate.rawMessages) &&
    Array.isArray(candidate.tracks)
  );
}

function isLibraryPatch(value: unknown): value is LibraryPatch {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<LibraryPatch>;
  return (
    typeof candidate.addedAt === 'string' &&
    typeof candidate.name === 'string' &&
    candidate.name.trim() !== '' &&
    isStoredPatch(candidate.patch)
  );
}

function parseJson(serialized: string): unknown {
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
}

function loadStoredArray<T>(key: string, predicate: (value: unknown) => value is T): T[] {
  try {
    const serialized = localStorage.getItem(key);
    if (serialized === null) return [];
    const parsed: unknown = JSON.parse(serialized);
    return Array.isArray(parsed) ? parsed.filter(predicate) : [];
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
    loadStoredArray(HISTORY_STORAGE_KEY, isStoredPatch).slice(0, MAX_HISTORY_LENGTH),
  );
  const patchLibrary = ref<LibraryPatch[]>(loadStoredArray(LIBRARY_STORAGE_KEY, isLibraryPatch));

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
    const imported = candidate.patches.filter(isStoredPatch);
    if (imported.length !== candidate.patches.length) throw new Error('The history export contains invalid patches.');
    patchHistory.value = uniquePatches([...imported, ...patchHistory.value]).slice(0, MAX_HISTORY_LENGTH);
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
    const imported = candidate.entries.filter(isLibraryPatch);
    if (imported.length !== candidate.entries.length) throw new Error('The library export contains invalid entries.');
    patchLibrary.value = uniqueLibraryEntries([...imported, ...patchLibrary.value]);
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
