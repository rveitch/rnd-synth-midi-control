<script setup lang="ts">
import { computed } from 'vue';
import { useMidi } from './composables/useMidi';
import { formatHex, getNoteName, getScaleName } from './midi/rndProtocol';

const midi = useMidi();
const inactiveTracks = computed(() => {
  const active = new Set(midi.latestPatch.value?.tracks.map((track) => track.index) ?? []);
  return [0, 1, 2, 3].filter((index) => !active.has(index));
});

function handleInput(event: Event): void { void midi.selectInput((event.target as HTMLSelectElement).value); }
function handleOutput(event: Event): void { void midi.selectOutput((event.target as HTMLSelectElement).value); }

function exportPatch(): void {
  const patch = midi.latestPatch.value;
  if (patch === null) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `rnd-patch-${patch.seed}.json`; anchor.click(); URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="shell">
    <header>
      <div class="brand">
        <span>RND</span> MIDI Control
      </div>
      <div class="safe">
        Receive-only SysEx
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
        <section class="panel connection">
          <div class="heading">
            <div>
              <p class="eyebrow">
                Hardware
              </p><h2>MIDI connection</h2>
            </div>
            <span
              class="status"
              :class="{ online: midi.connected.value }"
            >● {{ midi.connected.value ? 'Connected' : 'Disconnected' }}</span>
          </div>
          <p class="muted">
            MIDI and SysEx permission is required to read the patch metadata announced by the synth.
          </p>
          <button
            v-if="!midi.connected.value"
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
            v-if="midi.connected.value"
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
        </section>

        <section class="panel inspector">
          <div class="heading">
            <div>
              <p class="eyebrow">
                Latest idea
              </p><h2>Patch inspector</h2>
            </div><button
              class="secondary"
              :disabled="midi.latestPatch.value === null"
              @click="exportPatch"
            >
              Export JSON
            </button>
          </div>
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
              <article><span>Probable tonic</span><strong>{{ getNoteName(midi.latestPatch.value.global.tonicIndex) }}</strong><small>Raw {{ midi.latestPatch.value.global.tonicIndex }}</small></article>
              <article><span>Probable scale</span><strong>{{ getScaleName(midi.latestPatch.value.global.scaleIndex) }}</strong><small>Raw {{ midi.latestPatch.value.global.scaleIndex }}</small></article>
              <article><span>Unknown globals</span><strong>{{ midi.latestPatch.value.global.valueA }} · {{ midi.latestPatch.value.global.valueB }} · {{ midi.latestPatch.value.global.valueC }}</strong><small>{{ formatHex(midi.latestPatch.value.global.raw) }}</small></article>
            </div>
            <div class="tracks">
              <article
                v-for="track in midi.latestPatch.value.tracks"
                :key="track.index"
              >
                <b>0{{ track.index + 1 }}</b><div><span>Track {{ track.index + 1 }}</span><h3>{{ track.engine }}</h3><small>Unknown {{ track.valueA }} · {{ track.valueB }}</small></div>
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
