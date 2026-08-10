<script setup lang="ts">
import type { LibraryPatch } from '../composables/usePatchCollections';
import { formatHex, getNoteName, getPlaybackMode, getScaleName } from '../midi/rndProtocol';

defineProps<{
  canRecall: boolean;
  entries: LibraryPatch[];
  recallingSeed: number | null;
}>();

const emit = defineEmits<{
  export: [];
  import: [file: File];
  recall: [entry: LibraryPatch];
  remove: [entry: LibraryPatch];
  rename: [entry: LibraryPatch, name: string];
}>();

function formatAddedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function handleRename(entry: LibraryPatch, event: Event): void {
  emit('rename', entry, (event.target as HTMLInputElement).value);
}

function handleImport(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file !== undefined) emit('import', file);
  input.value = '';
}
</script>

<template>
  <section class="panel history-panel library-panel">
    <div class="heading history-heading">
      <div>
        <p class="eyebrow">
          Durable collection
        </p>
        <h2>Patch library</h2>
      </div>
      <span class="history-count">{{ entries.length }} saved</span>
    </div>

    <div class="collection-actions">
      <button
        type="button"
        :disabled="entries.length === 0"
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
      v-if="entries.length === 0"
      class="muted history-empty"
    >
      Name patches from history and add them here for permanent storage.
    </p>

    <div
      v-else
      class="history-list library-list"
    >
      <details
        v-for="entry in entries"
        :key="entry.patch.seed"
        class="history-entry library-entry"
      >
        <summary>
          <span><strong>{{ entry.name }}</strong><small>{{ formatAddedAt(entry.addedAt) }}</small></span>
          <span class="history-engines">{{ entry.patch.tracks.map((track) => track.engine).join(' · ') || 'No active tracks' }}</span>
        </summary>

        <div class="history-details">
          <label class="patch-name-field">
            Patch name
            <input
              type="text"
              :value="entry.name"
              @change="handleRename(entry, $event)"
            >
          </label>
          <dl v-if="entry.patch.global">
            <div><dt>Seed</dt><dd>{{ entry.patch.seed.toLocaleString() }}</dd></div>
            <div><dt>Tonic</dt><dd>{{ getNoteName(entry.patch.global.tonicIndex) }}</dd></div>
            <div><dt>Scale</dt><dd>{{ getScaleName(entry.patch.global.scaleIndex) }}</dd></div>
            <div><dt>Playback</dt><dd>{{ getPlaybackMode(entry.patch.global.valueA) }}</dd></div>
            <div><dt>Raw globals</dt><dd>{{ formatHex(entry.patch.global.raw) }}</dd></div>
          </dl>
          <ol class="history-tracks">
            <li
              v-for="track in entry.patch.tracks"
              :key="track.index"
            >
              <span>Track {{ track.index + 1 }}</span><strong>{{ track.engine }}</strong><small>{{ track.valueA }} · {{ track.valueB }}</small>
            </li>
          </ol>
          <div class="patch-actions">
            <button
              class="history-recall"
              type="button"
              :disabled="!canRecall || recallingSeed !== null"
              @click="$emit('recall', entry)"
            >
              {{ recallingSeed === entry.patch.seed ? 'Recalling…' : 'Recall' }}
            </button>
            <button
              class="library-remove"
              type="button"
              @click="$emit('remove', entry)"
            >
              Remove
            </button>
          </div>
        </div>
      </details>
    </div>
  </section>
</template>
