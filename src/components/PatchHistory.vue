<script setup lang="ts">
import { reactive } from 'vue';
import { formatHex, getNoteName, getScaleName, type RndPatch } from '../midi/rndProtocol';

defineProps<{
  canRecall: boolean;
  librarySeeds: number[];
  patches: RndPatch[];
  recallingSeed: number | null;
}>();

const emit = defineEmits<{
  addToLibrary: [patch: RndPatch, name: string];
  clear: [];
  export: [];
  import: [file: File];
  recall: [patch: RndPatch];
}>();

const draftNames = reactive<Record<string, string>>({});

function formatCapturedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function updateDraftName(seed: number, event: Event): void {
  draftNames[String(seed)] = (event.target as HTMLInputElement).value;
}

function addToLibrary(patch: RndPatch): void {
  emit('addToLibrary', patch, draftNames[String(patch.seed)] ?? '');
}

function handleImport(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file !== undefined) emit('import', file);
  input.value = '';
}
</script>

<template>
  <section class="panel history-panel">
    <div class="heading history-heading">
      <div>
        <p class="eyebrow">
          Rolling capture
        </p>
        <h2>Patch history</h2>
      </div>
      <span class="history-count">{{ patches.length }} / 100</span>
    </div>

    <div class="collection-actions">
      <button
        type="button"
        :disabled="patches.length === 0"
        @click="$emit('export')"
      >
        Export
      </button>
      <label>Import<input
        type="file"
        accept="application/json,.json"
        @change="handleImport"
      ></label>
    </div>

    <p
      v-if="patches.length === 0"
      class="muted history-empty"
    >
      Completed patches will be saved here automatically in this browser.
    </p>

    <div
      v-else
      class="history-list"
    >
      <details
        v-for="patch in patches"
        :key="patch.seed"
        class="history-entry"
      >
        <summary>
          <span><strong>{{ patch.seed.toLocaleString() }}</strong><small>{{ formatCapturedAt(patch.capturedAt) }}</small></span>
          <span class="history-engines">{{ patch.tracks.map((track) => track.engine).join(' · ') || 'No active tracks' }}</span>
        </summary>

        <div class="history-details">
          <dl v-if="patch.global">
            <div><dt>Tonic</dt><dd>{{ getNoteName(patch.global.tonicIndex) }}</dd></div>
            <div><dt>Scale</dt><dd>{{ getScaleName(patch.global.scaleIndex) }}</dd></div>
            <div><dt>Globals</dt><dd>{{ formatHex(patch.global.raw) }}</dd></div>
          </dl>
          <ol class="history-tracks">
            <li
              v-for="track in patch.tracks"
              :key="track.index"
            >
              <span>Track {{ track.index + 1 }}</span><strong>{{ track.engine }}</strong><small>{{ track.valueA }} · {{ track.valueB }}</small>
            </li>
          </ol>

          <label class="patch-name-field">
            Library name
            <input
              type="text"
              :placeholder="`Patch ${patch.seed}`"
              :value="draftNames[String(patch.seed)] ?? ''"
              @input="updateDraftName(patch.seed, $event)"
            >
          </label>
          <div class="patch-actions">
            <button
              class="history-recall"
              type="button"
              :disabled="!canRecall || recallingSeed !== null"
              @click="$emit('recall', patch)"
            >
              {{ recallingSeed === patch.seed ? 'Recalling…' : 'Recall' }}
            </button>
            <button
              class="library-add"
              type="button"
              @click="addToLibrary(patch)"
            >
              {{ librarySeeds.includes(patch.seed) ? 'Update library' : 'Add to library' }}
            </button>
          </div>
          <p
            v-if="!canRecall"
            class="recall-hint"
          >
            Connect a MIDI output to recall this seed.
          </p>
        </div>
      </details>
    </div>

    <button
      v-if="patches.length > 0"
      class="clear-history"
      type="button"
      @click="$emit('clear')"
    >
      Clear history
    </button>
  </section>
</template>
