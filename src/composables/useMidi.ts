import { onBeforeUnmount, onMounted, ref } from 'vue';
import { MidiController, type MidiPortOption } from '../midi/midiController';
import { formatHex, type RndPatch, type RndProtocolMessage } from '../midi/rndProtocol';
import { usePatchCollections } from './usePatchCollections';

export interface DiagnosticEntry {
  hex: string;
  id: number;
  kind: RndProtocolMessage['kind'];
  receivedAt: string;
}

export function useMidi() {
  const connected = ref(false);
  const connecting = ref(false);
  const midiAccessGranted = ref(false);
  const diagnostics = ref<DiagnosticEntry[]>([]);
  const error = ref('');
  const inputs = ref<MidiPortOption[]>([]);
  const latestPatch = ref<RndPatch | null>(null);
  const outputs = ref<MidiPortOption[]>([]);
  const recallingSeed = ref<number | null>(null);
  const selectedInputId = ref('');
  const selectedOutputId = ref('');
  const sequencerState = ref<'running' | 'stopped' | 'unknown'>('unknown');
  let diagnosticId = 0;
  let recallResetTimer: ReturnType<typeof setTimeout> | null = null;
  const collections = usePatchCollections();

  const controller = new MidiController({
    onAccessChange: refreshPorts,
    onMessage(message) {
      diagnosticId += 1;
      diagnostics.value = [{
        hex: formatHex(message.raw), id: diagnosticId, kind: message.kind,
        receivedAt: new Date().toLocaleTimeString(),
      }, ...diagnostics.value].slice(0, 100);
    },
    onPatchComplete(patch) {
      latestPatch.value = patch;
      collections.savePatch(patch);
      if (recallingSeed.value === patch.seed) clearRecallState();
    },
    onPatchUpdate(patch) { latestPatch.value = patch; },
  });

  async function connect(): Promise<void> {
    if (midiAccessGranted.value || connecting.value) return;
    connecting.value = true; error.value = '';
    try { await controller.connect(); midiAccessGranted.value = true; refreshPorts(); }
    catch (cause) { error.value = cause instanceof Error ? cause.message : 'Unable to access MIDI devices.'; }
    finally { connecting.value = false; }
  }

  async function disconnect(): Promise<void> {
    clearRecallState();
    await controller.disconnect(); connected.value = false; midiAccessGranted.value = false; inputs.value = []; outputs.value = [];
    selectedInputId.value = ''; selectedOutputId.value = '';
  }

  async function selectInput(id: string): Promise<void> {
    await controller.selectInput(id);
    if (id !== '' && selectedOutputId.value !== '') controller.requestCurrentState();
    refreshPorts();
  }
  async function selectOutput(id: string): Promise<void> { await controller.selectOutput(id); refreshPorts(); }

  function recallPatch(patch: RndPatch): void {
    sendSeed(patch.seed);
  }

  function generatePatch(): void {
    if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
      error.value = 'This browser cannot generate a secure random patch seed.';
      return;
    }

    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    const seed = values[0];
    if (seed === undefined) {
      error.value = 'Unable to generate a random patch seed.';
      return;
    }

    sendSeed(seed);
  }

  function sendSeed(seed: number): void {
    error.value = '';
    clearRecallState();
    try {
      sequencerState.value = 'unknown';
      recallingSeed.value = seed;
      controller.recallSeed(seed);
      recallResetTimer = setTimeout(clearRecallState, 2_000);
    } catch (cause) {
      recallingSeed.value = null;
      error.value = cause instanceof Error ? cause.message : 'Unable to recall the selected patch.';
    }
  }

  function setSequencerStopped(stopped: boolean): void {
    error.value = '';
    try {
      controller.setSequencerStopped(stopped);
      sequencerState.value = stopped ? 'stopped' : 'running';
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Unable to control the sequencer.';
    }
  }

  function refreshPorts(): void {
    inputs.value = controller.getInputs(); outputs.value = controller.getOutputs();
    selectedInputId.value = controller.getSelectedInputId(); selectedOutputId.value = controller.getSelectedOutputId();
    connected.value = controller.isDeviceConnected();
  }

  function clearDiagnostics(): void { diagnostics.value = []; }

  function clearRecallState(): void {
    recallingSeed.value = null;
    if (recallResetTimer !== null) {
      clearTimeout(recallResetTimer);
      recallResetTimer = null;
    }
  }

  onMounted(() => { void connect(); });
  onBeforeUnmount(() => { clearRecallState(); void controller.disconnect(); });

  return {
    ...collections,
    clearDiagnostics, connect, connected, connecting, diagnostics, disconnect, error, generatePatch, inputs,
    latestPatch, outputs, recallPatch, recallingSeed, selectedInputId, selectedOutputId, selectInput, selectOutput,
    midiAccessGranted, sequencerState, setSequencerStopped,
  };
}
