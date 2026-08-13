<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import PatchHistory from './components/PatchHistory.vue';
import PatchLibrary from './components/PatchLibrary.vue';
import type { LibraryPatch } from './composables/usePatchCollections';
import { useMidi } from './composables/useMidi';
import { getNoteName, getPatchModeLabel, getScaleName } from './midi/rndProtocol';

const midi = useMidi();
const collectionMessage = ref('');
const connectionOpen = ref(!midi.connected.value);
const historyOpen = ref(true);
const libraryOpen = ref(true);
const inactiveTracks = computed(() => {
  const active = new Set(midi.latestPatch.value?.tracks.map((track) => track.index) ?? []);
  return [0, 1, 2, 3].filter((index) => !active.has(index));
});
const librarySeeds = computed(() => midi.patchLibrary.value.map((entry) => entry.patch.seed));

watch(midi.connected, (connected) => {
  connectionOpen.value = !connected;
});

function syncConnectionDisclosure(event: Event): void {
  connectionOpen.value = (event.currentTarget as HTMLDetailsElement).open;
}

function handleInput(event: Event): void { void midi.selectInput((event.target as HTMLSelectElement).value); }
function handleOutput(event: Event): void { void midi.selectOutput((event.target as HTMLSelectElement).value); }

function exportPatch(): void {
  const patch = midi.latestPatch.value;
  if (patch === null) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `rnd-patch-${patch.seed}.json`; anchor.click(); URL.revokeObjectURL(url);
}

function clearPatchHistory(): void {
  if (window.confirm('Clear all locally saved patch history?')) midi.clearHistory();
}

function removeHistoryPatch(patch: Parameters<typeof midi.recallPatch>[0]): void {
  const detail = librarySeeds.value.includes(patch.seed) ? ' Its library copy will remain saved.' : '';
  if (window.confirm(`Remove patch ${patch.seed.toLocaleString()} from history?${detail}`)) {
    midi.removeFromHistory(patch.seed);
    collectionMessage.value = 'Patch removed from history.';
  }
}

function addToLibrary(patch: Parameters<typeof midi.addToLibrary>[0], name: string): void {
  midi.addToLibrary(patch, name);
  collectionMessage.value = 'Patch added to the library.';
}

function recallLibraryPatch(entry: LibraryPatch): void {
  midi.recallPatch(entry.patch);
}

function renameLibraryPatch(entry: LibraryPatch, name: string): void {
  try {
    midi.renameLibraryPatch(entry.patch.seed, name);
    collectionMessage.value = 'Patch name updated.';
  } catch (cause) {
    collectionMessage.value = cause instanceof Error ? cause.message : 'Unable to rename this patch.';
  }
}

function removeLibraryPatch(entry: LibraryPatch): void {
  if (window.confirm(`Remove “${entry.name}” from the library?`)) {
    midi.removeFromLibrary(entry.patch.seed);
    collectionMessage.value = 'Patch removed from the library.';
  }
}

function exportHistory(): void {
  downloadJson(midi.exportHistory(), `rnd-patch-history-${dateStamp()}.json`);
}

function exportLibrary(): void {
  downloadJson(midi.exportLibrary(), `rnd-patch-library-${dateStamp()}.json`);
}

async function importHistory(file: File): Promise<void> {
  await importCollection(file, midi.importHistory, 'history');
}

async function importLibrary(file: File): Promise<void> {
  await importCollection(file, midi.importLibrary, 'library');
}

async function importCollection(file: File, importer: (serialized: string) => number, label: string): Promise<void> {
  try {
    const count = importer(await file.text());
    collectionMessage.value = `Imported ${count} ${label} ${count === 1 ? 'entry' : 'entries'}.`;
  } catch (cause) {
    collectionMessage.value = cause instanceof Error ? cause.message : `Unable to import the ${label}.`;
  }
}

function downloadJson(serialized: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
</script>

<template>
  <div class="shell">
    <header>
      <div class="brand">
        <span>RND</span> MIDI Control
      </div>
      <div class="safe">
        Verified seed recall
      </div>
    </header>

    <main>
      <section class="hero">
        <p class="eyebrow">
          Cyma Forma
        </p>
        <h1>See what the<br>button created.</h1>
        <p>A local-first patch inspector and MIDI control foundation for the RND Synth.</p>
      </section>

      <div class="workspace">
        <details
          class="panel connection connection-disclosure"
          :open="connectionOpen"
          @toggle="syncConnectionDisclosure"
        >
          <summary class="heading disclosure-heading">
            <div>
              <p class="eyebrow">
                Hardware
              </p><h2>MIDI connection</h2>
            </div>
            <span class="disclosure-meta">
              <span
                class="status"
                :class="{ online: midi.connected.value }"
              >● {{ midi.connected.value ? 'Connected' : midi.midiAccessGranted.value ? 'MIDI ready · RND unavailable' : 'Disconnected' }}</span>
              <span
                class="disclosure-icon"
                aria-hidden="true"
              >⌄</span>
            </span>
          </summary>
          <div class="connection-body">
            <p class="muted">
              MIDI and SysEx permission is required to read the patch metadata announced by the synth.
            </p>
            <button
              v-if="!midi.midiAccessGranted.value"
              class="primary"
              :disabled="midi.connecting.value"
              @click="midi.connect"
            >
              {{ midi.connecting.value ? 'Waiting for permission…' : 'Connect RND Synth' }}
            </button>
            <button
              v-else
              class="secondary"
              @click="midi.disconnect"
            >
              Disconnect
            </button>
            <p
              v-if="midi.error.value"
              class="error"
            >
              {{ midi.error.value }}
            </p>
            <div
              v-if="midi.midiAccessGranted.value"
              class="ports"
            >
              <label>MIDI input<select
                :value="midi.selectedInputId.value"
                @change="handleInput"
              ><option value="">Select input</option><option
                v-for="port in midi.inputs.value"
                :key="port.id"
                :value="port.id"
              >{{ port.name }} · {{ port.state }}</option></select></label>
              <label>MIDI output<select
                :value="midi.selectedOutputId.value"
                @change="handleOutput"
              ><option value="">Select output</option><option
                v-for="port in midi.outputs.value"
                :key="port.id"
                :value="port.id"
              >{{ port.name }} · {{ port.state }}</option></select></label>
            </div>
          </div>
        </details>

        <section class="panel inspector">
          <div class="heading">
            <div>
              <p class="eyebrow">
                Latest idea
              </p><h2>Patch inspector</h2>
            </div><div class="inspector-actions">
              <button
                class="generate-button"
                :disabled="!midi.connected.value || midi.selectedOutputId.value === '' || midi.recallingSeed.value !== null"
                @click="midi.generatePatch"
              >
                Generate patch
              </button>
              <button
                class="secondary"
                :disabled="midi.latestPatch.value === null"
                @click="exportPatch"
              >
                Export JSON
              </button>
            </div>
          </div>
          <section
            class="sequencer-control"
            aria-label="Sequencer control"
          >
            <div>
              <span>Sequencer control</span>
              <strong>{{ midi.sequencerState.value === 'stopped' ? 'Stopped' : midi.sequencerState.value === 'running' ? 'Running' : 'Ready' }}</strong>
              <small>Start restarts the sequence from the beginning</small>
            </div>
            <div class="sequencer-actions">
              <button
                class="secondary"
                type="button"
                :disabled="midi.selectedOutputId.value === '' || midi.sequencerState.value === 'stopped'"
                @click="midi.setSequencerStopped(true)"
              >
                Stop
              </button>
              <button
                class="primary"
                type="button"
                :disabled="midi.selectedOutputId.value === '' || midi.sequencerState.value === 'running'"
                @click="midi.setSequencerStopped(false)"
              >
                Start
              </button>
            </div>
          </section>
          <div
            v-if="midi.latestPatch.value === null"
            class="empty"
          >
            <div class="orb">
              <span />
            </div><h3>Waiting for a new idea</h3><p>Connect the synth and press its button.</p>
          </div>
          <template v-else>
            <div class="seed">
              <span>Random seed</span><strong>{{ midi.latestPatch.value.seed.toLocaleString() }}</strong><code>0x{{ midi.latestPatch.value.seed.toString(16).padStart(8, '0').toUpperCase() }}</code>
            </div>
            <div
              v-if="midi.latestPatch.value.global"
              class="globals"
            >
              <article><span>Root when captured</span><strong>{{ getNoteName(midi.latestPatch.value.global.rootWhenCaptured) }}</strong><small>Raw {{ midi.latestPatch.value.global.rootWhenCaptured }}</small></article>
              <article><span>Scale</span><strong>{{ getScaleName(midi.latestPatch.value.global.scaleIndex) }}</strong><small>Raw {{ midi.latestPatch.value.global.scaleIndex }}</small></article>
              <article><span>Patch mode</span><strong>{{ getPatchModeLabel(midi.latestPatch.value.global.patchMode) }}</strong><small>Mode {{ midi.latestPatch.value.global.patchMode }} · {{ midi.latestPatch.value.global.tempoBpm }} BPM</small></article>
            </div>
            <div class="tracks">
              <article
                v-for="track in midi.latestPatch.value.tracks"
                :key="track.index"
              >
                <b>0{{ track.index + 1 }}</b><div><span>Track {{ track.index + 1 }}</span><h3>{{ track.engine }}</h3><small>Role {{ track.role }} · Variant {{ track.roleVariant }}</small></div>
              </article>
              <article
                v-for="index in inactiveTracks"
                :key="index"
                class="inactive"
              >
                <b>0{{ index + 1 }}</b><div><span>Track {{ index + 1 }}</span><h3>Inactive</h3><small>No metadata announced</small></div>
              </article>
            </div>
          </template>
        </section>
      </div>

      <p
        v-if="collectionMessage"
        class="collection-message"
        role="status"
      >
        {{ collectionMessage }}
      </p>

      <div class="collections-grid">
        <PatchHistory
          :can-recall="midi.connected.value && midi.selectedOutputId.value !== ''"
          :library-seeds="librarySeeds"
          :open="historyOpen"
          :patches="midi.patchHistory.value"
          :recalling-seed="midi.recallingSeed.value"
          @add-to-library="addToLibrary"
          @clear="clearPatchHistory"
          @export="exportHistory"
          @import="importHistory"
          @recall="midi.recallPatch"
          @remove="removeHistoryPatch"
          @toggle="historyOpen = $event"
        />

        <PatchLibrary
          :can-recall="midi.connected.value && midi.selectedOutputId.value !== ''"
          :entries="midi.patchLibrary.value"
          :open="libraryOpen"
          :recalling-seed="midi.recallingSeed.value"
          @export="exportLibrary"
          @import="importLibrary"
          @recall="recallLibraryPatch"
          @remove="removeLibraryPatch"
          @rename="renameLibraryPatch"
          @toggle="libraryOpen = $event"
        />
      </div>

      <details class="panel diagnostics">
        <summary><span><i class="eyebrow">Development</i><strong>MIDI diagnostics</strong></span><span>{{ midi.diagnostics.value.length }} messages</span></summary>
        <div class="diagnostic-head">
          <p>Only SysEx is retained. Note traffic is ignored.</p><button @click="midi.clearDiagnostics">
            Clear
          </button>
        </div>
        <p
          v-if="midi.diagnostics.value.length === 0"
          class="muted pad"
        >
          No SysEx captured yet.
        </p>
        <ol>
          <li
            v-for="entry in midi.diagnostics.value"
            :key="entry.id"
          >
            <time>{{ entry.receivedAt }}</time><em>{{ entry.kind }}</em><code>{{ entry.hex }}</code>
          </li>
        </ol>
      </details>
    </main>
    <footer>RND Synth MIDI Control <span>Vue · Web MIDI · Local first</span></footer>
  </div>
</template>
