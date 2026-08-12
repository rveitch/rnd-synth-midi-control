<script setup lang="ts">
import { reactive } from 'vue';
import { formatHex, getNoteName, getPatchModeLabel, getScaleName, type RndPatch } from '../midi/rndProtocol';

defineProps<{
  canRecall: boolean;
  librarySeeds: number[];
  open: boolean;
  patches: RndPatch[];
  recallingSeed: number | null;
}>();

const emit = defineEmits<{
  addToLibrary: [patch: RndPatch, name: string];
  clear: [];
  export: [];
  import: [file: File];
  recall: [patch: RndPatch];
  remove: [patch: RndPatch];
  toggle: [open: boolean];
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
  <details
    class="panel history-panel collection-disclosure"
    :open="open"
    @toggle="$emit('toggle', ($event.currentTarget as HTMLDetailsElement).open)"
  >
    <summary class="heading history-heading disclosure-heading">
      <div>
        <p class="eyebrow">
          Rolling capture
        </p>
        <h2>Patch history</h2>
      </div>
      <span class="disclosure-meta"><span class="history-count">{{ patches.length }} / 100</span><span
        class="disclosure-icon"
        aria-hidden="true"
      >⌄</span></span>
    </summary>

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
            <div><dt>Root captured</dt><dd>{{ getNoteName(patch.global.rootWhenCaptured) }}</dd></div>
            <div><dt>Scale</dt><dd>{{ getScaleName(patch.global.scaleIndex) }}</dd></div>
            <div><dt>Tempo</dt><dd>{{ patch.global.tempoBpm }} BPM</dd></div>
            <div><dt>Patch mode</dt><dd>{{ getPatchModeLabel(patch.global.patchMode) }}</dd></div>
            <div><dt>Raw globals</dt><dd>{{ formatHex(patch.global.raw) }}</dd></div>
          </dl>
          <ol class="history-tracks">
            <li
              v-for="track in patch.tracks"
              :key="track.index"
            >
              <span>Track {{ track.index + 1 }}</span><strong>{{ track.engine }}</strong><small>Role {{ track.role }} · Variant {{ track.roleVariant }}</small>
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
          <button
            class="history-remove"
            type="button"
            @click="$emit('remove', patch)"
          >
            Remove from history
          </button>
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
  </details>
</template>
