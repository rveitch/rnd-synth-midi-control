export const SCALE_NAMES = [
  'Major', 'Minor', 'Harmonic Minor', 'Blues', 'Major Pentatonic', 'Minor Pentatonic',
  'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Locrian', 'Whole Tone',
  'Double Harmonic', 'Hungarian Minor', 'Phrygian Dominant', 'Hirajoshi', 'In Sen',
  'Prometheus', 'Octatonic', 'Persian',
] as const;

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

export interface RndGlobalMetadata {
  raw: [number, number, number, number, number];
  scaleIndex: number;
  tonicIndex: number;
  valueA: number;
  valueB: number;
  valueC: number;
}

export interface RndTrackMetadata {
  engine: string;
  index: number;
  raw: number[];
  valueA: number;
  valueB: number;
}

export interface RndPatch {
  capturedAt: string;
  global: RndGlobalMetadata | null;
  rawMessages: number[][];
  seed: number;
  tracks: RndTrackMetadata[];
}

export type RndProtocolMessage =
  | { kind: 'seed'; raw: number[]; seed: number }
  | { kind: 'patchStart'; raw: number[] }
  | { kind: 'global'; metadata: RndGlobalMetadata; raw: number[] }
  | { kind: 'track'; metadata: RndTrackMetadata; raw: number[] }
  | { kind: 'unknown'; messageType: number; payload: number[]; raw: number[] }
  | { kind: 'invalid'; reason: string; raw: number[] };

function hasRndEnvelope(bytes: number[]): boolean {
  const header = [0xf0, 0x6f, 0x62, 0x78];
  return bytes.length >= 6 && header.every((byte, index) => bytes[index] === byte) && bytes.at(-1) === 0xf7;
}

export function decodeSevenBitLittleEndian(bytes: number[]): number {
  return bytes.reduce((value, byte, index) => value + byte * 128 ** index, 0);
}

function decodeAscii(bytes: number[]): string {
  const terminatorIndex = bytes.indexOf(0);
  return String.fromCharCode(...(terminatorIndex >= 0 ? bytes.slice(0, terminatorIndex) : bytes));
}

export function parseRndSysEx(data: ArrayLike<number>): RndProtocolMessage {
  const raw = Array.from(data);
  if (!hasRndEnvelope(raw)) {
    return { kind: 'invalid', reason: 'Message does not use the RND Synth SysEx envelope.', raw };
  }

  const messageType = raw[4];
  const payload = raw.slice(5, -1);
  if (messageType === 0x10) {
    if (payload.length !== 5 || payload.some((byte) => byte > 0x7f)) {
      return { kind: 'invalid', reason: 'Seed message must contain five seven-bit bytes.', raw };
    }
    return { kind: 'seed', raw, seed: decodeSevenBitLittleEndian(payload) };
  }
  if (messageType === 0x20) {
    return { kind: 'patchStart', raw };
  }
  if (messageType === 0x21) {
    if (payload.length !== 5) {
      return { kind: 'invalid', reason: 'Global message must contain five bytes.', raw };
    }
    const [valueA, valueB, valueC, tonicIndex, scaleIndex] = payload as [number, number, number, number, number];
    return {
      kind: 'global', raw,
      metadata: {
        raw: [valueA, valueB, valueC, tonicIndex, scaleIndex],
        scaleIndex, tonicIndex, valueA, valueB, valueC,
      },
    };
  }
  if (messageType === 0x22) {
    if (payload.length < 4) {
      return { kind: 'invalid', reason: 'Track message payload is incomplete.', raw };
    }
    const [index, valueA, valueB] = payload as [number, number, number];
    return {
      kind: 'track', raw,
      metadata: { engine: decodeAscii(payload.slice(3)), index, raw: [...payload], valueA, valueB },
    };
  }
  return { kind: 'unknown', messageType: messageType ?? -1, payload, raw };
}

export function formatHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

export function getScaleName(index: number): string {
  return SCALE_NAMES[index] ?? `Unknown (${index})`;
}

export function getNoteName(index: number): string {
  return NOTE_NAMES[index] ?? `Unknown (${index})`;
}
