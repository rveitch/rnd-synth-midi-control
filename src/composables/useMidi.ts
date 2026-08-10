import { onBeforeUnmount, ref } from 'vue';
import { MidiController, type MidiPortOption } from '../midi/midiController';
import { formatHex, type RndPatch, type RndProtocolMessage } from '../midi/rndProtocol';

export interface DiagnosticEntry {
  hex: string;
  id: number;
  kind: RndProtocolMessage['kind'];
  receivedAt: string;
}

export function useMidi() {
  const connected = ref(false);
  const connecting = ref(false);
  const diagnostics = ref<DiagnosticEntry[]>([]);
  const error = ref('');
  const inputs = ref<MidiPortOption[]>([]);
  const latestPatch = ref<RndPatch | null>(null);
  const outputs = ref<MidiPortOption[]>([]);
  const selectedInputId = ref('');
  const selectedOutputId = ref('');
  let diagnosticId = 0;

  const controller = new MidiController({
    onAccessChange: refreshPorts,
    onMessage(message) {
      diagnosticId += 1;
      diagnostics.value = [{
        hex: formatHex(message.raw), id: diagnosticId, kind: message.kind,
        receivedAt: new Date().toLocaleTimeString(),
      }, ...diagnostics.value].slice(0, 100);
    },
    onPatch(patch) { latestPatch.value = patch; },
  });

  async function connect(): Promise<void> {
    connecting.value = true; error.value = '';
    try { await controller.connect(); connected.value = true; refreshPorts(); }
    catch (cause) { error.value = cause instanceof Error ? cause.message : 'Unable to access MIDI devices.'; }
    finally { connecting.value = false; }
  }

  async function disconnect(): Promise<void> {
    await controller.disconnect(); connected.value = false; inputs.value = []; outputs.value = [];
    selectedInputId.value = ''; selectedOutputId.value = '';
  }

  async function selectInput(id: string): Promise<void> { await controller.selectInput(id); refreshPorts(); }
  async function selectOutput(id: string): Promise<void> { await controller.selectOutput(id); refreshPorts(); }

  function refreshPorts(): void {
    inputs.value = controller.getInputs(); outputs.value = controller.getOutputs();
    selectedInputId.value = controller.getSelectedInputId(); selectedOutputId.value = controller.getSelectedOutputId();
  }

  function clearDiagnostics(): void { diagnostics.value = []; }
  onBeforeUnmount(() => { void controller.disconnect(); });

  return {
    clearDiagnostics, connect, connected, connecting, diagnostics, disconnect, error, inputs,
    latestPatch, outputs, selectedInputId, selectedOutputId, selectInput, selectOutput,
  };
}
