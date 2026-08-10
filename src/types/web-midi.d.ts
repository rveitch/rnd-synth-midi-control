interface MIDIConnectionEvent extends Event { readonly port: MIDIPort }
interface MIDIMessageEvent extends Event { readonly data: Uint8Array; readonly receivedTime: DOMHighResTimeStamp }
interface MIDIPort extends EventTarget {
  readonly connection: 'open' | 'closed' | 'pending'; readonly id: string;
  readonly manufacturer: string | null; readonly name: string | null;
  readonly state: 'connected' | 'disconnected'; readonly type: 'input' | 'output';
  readonly version: string | null; close(): Promise<MIDIPort>; open(): Promise<MIDIPort>;
}
interface MIDIInput extends MIDIPort { onmidimessage: ((event: MIDIMessageEvent) => void) | null }
interface MIDIOutput extends MIDIPort { clear(): void; send(data: Iterable<number>, timestamp?: DOMHighResTimeStamp): void }
interface MIDIAccess extends EventTarget {
  readonly inputs: ReadonlyMap<string, MIDIInput>; readonly outputs: ReadonlyMap<string, MIDIOutput>;
  readonly sysexEnabled: boolean; onstatechange: ((event: MIDIConnectionEvent) => void) | null;
}
interface Navigator { requestMIDIAccess(options?: { software?: boolean; sysex?: boolean }): Promise<MIDIAccess> }
