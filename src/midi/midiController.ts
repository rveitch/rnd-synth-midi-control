import { RndPatchAssembler } from './patchAssembler';
import {
  encodeSeedSysEx,
  encodeSequencerControlSysEx,
  encodeStatusRequestSysEx,
  parseRndSysEx,
  type RndPatch,
  type RndProtocolMessage,
} from './rndProtocol';

const PREFERRED_DEVICE_NAME = 'rnd synth';
const PATCH_SETTLE_TIME_MS = 100;

export interface MidiPortOption {
  id: string;
  name: string;
  state: MIDIPort['state'];
}

export interface MidiControllerCallbacks {
  onAccessChange(): void;
  onMessage(message: RndProtocolMessage): void;
  onPatchComplete(patch: RndPatch): void;
  onPatchUpdate(patch: RndPatch): void;
}

export class MidiController {
  private access: MIDIAccess | null = null;
  private assembler = new RndPatchAssembler();
  private callbacks: MidiControllerCallbacks;
  private input: MIDIInput | null = null;
  private output: MIDIOutput | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: MidiControllerCallbacks) { this.callbacks = callbacks; }

  async connect(): Promise<void> {
    if (typeof navigator.requestMIDIAccess !== 'function') throw new Error('This browser does not support Web MIDI.');
    this.access = await navigator.requestMIDIAccess({ sysex: true });
    this.access.onstatechange = () => { void this.handleAccessChange(); };
    await this.selectPreferredPorts();
    this.callbacks.onAccessChange();
  }

  getInputs(): MidiPortOption[] { return this.access === null ? [] : this.toOptions(this.access.inputs); }
  getOutputs(): MidiPortOption[] { return this.access === null ? [] : this.toOptions(this.access.outputs); }
  getSelectedInputId(): string { return this.input?.id ?? ''; }
  getSelectedOutputId(): string { return this.output?.id ?? ''; }
  isDeviceConnected(): boolean {
    return this.input?.state === 'connected' && this.output?.state === 'connected';
  }

  recallSeed(seed: number): void {
    if (this.output === null || this.output.state !== 'connected') {
      throw new Error('Select a connected MIDI output before recalling a patch.');
    }

    this.output.send(encodeSeedSysEx(seed));
  }

  async selectInput(id: string): Promise<void> {
    if (this.input !== null) { this.input.onmidimessage = null; await this.input.close(); }
    this.input = this.access?.inputs.get(id) ?? null;
    if (this.input !== null) { await this.input.open(); this.input.onmidimessage = (event) => this.handleMidiMessage(event); }
  }

  async selectOutput(id: string): Promise<void> {
    if (this.output !== null) await this.output.close();
    this.output = this.access?.outputs.get(id) ?? null;
    if (this.output !== null) {
      await this.output.open();
      if (this.input !== null) this.requestCurrentState();
    }
  }

  requestCurrentState(): void {
    if (this.output === null || this.output.state !== 'connected') return;
    this.output.send(encodeStatusRequestSysEx());
  }

  setSequencerStopped(stopped: boolean): void {
    if (this.output === null || this.output.state !== 'connected') {
      throw new Error('Select a connected MIDI output before controlling the sequencer.');
    }
    this.output.send(encodeSequencerControlSysEx(stopped));
  }

  async disconnect(): Promise<void> {
    this.clearTimer();
    this.assembler.complete();
    if (this.input !== null) { this.input.onmidimessage = null; await this.input.close(); }
    if (this.output !== null) await this.output.close();
    if (this.access !== null) this.access.onstatechange = null;
    this.input = null; this.output = null; this.access = null;
  }

  private handleMidiMessage(event: MIDIMessageEvent): void {
    const data = event.data;
    if (data === null || data[0] !== 0xf0) return;
    const message = parseRndSysEx(data);
    this.callbacks.onMessage(message);
    const completed = this.assembler.push(message);
    if (completed !== null) this.callbacks.onPatchComplete(completed);
    const snapshot = this.assembler.snapshot();
    if (snapshot !== null) this.callbacks.onPatchUpdate(snapshot);
    this.clearTimer();
    this.settleTimer = setTimeout(() => {
      const patch = this.assembler.complete();
      if (patch !== null) this.callbacks.onPatchComplete(patch);
    }, PATCH_SETTLE_TIME_MS);
  }

  private clearTimer(): void {
    if (this.settleTimer !== null) { clearTimeout(this.settleTimer); this.settleTimer = null; }
  }

  private async handleAccessChange(): Promise<void> {
    await this.selectPreferredPorts();
    this.callbacks.onAccessChange();
  }

  private async selectPreferredPorts(): Promise<void> {
    if (this.access === null) return;
    if (this.input?.state !== 'connected') {
      const input = this.findPreferredPort(this.access.inputs);
      await this.selectInput(input?.id ?? '');
    }
    if (this.output?.state !== 'connected') {
      const output = this.findPreferredPort(this.access.outputs);
      await this.selectOutput(output?.id ?? '');
    }
  }

  private findPreferredPort<T extends MIDIPort>(ports: ReadonlyMap<string, T>): T | null {
    return Array.from(ports.values()).find((port) =>
      port.state === 'connected' && port.name?.toLocaleLowerCase().includes(PREFERRED_DEVICE_NAME),
    ) ?? null;
  }

  private toOptions<T extends MIDIPort>(ports: ReadonlyMap<string, T>): MidiPortOption[] {
    return Array.from(ports.values()).map((port) => ({ id: port.id, name: port.name ?? 'Unnamed MIDI port', state: port.state }));
  }
}
