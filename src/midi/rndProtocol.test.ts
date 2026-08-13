import { describe, expect, it } from 'vitest';
import {
  decodeSevenBitLittleEndian,
  encodeSeedSysEx,
  encodeStatusRequestSysEx,
  getPatchModeLabel,
  parseRndSysEx,
} from './rndProtocol';

describe('RND Synth SysEx protocol', () => {
  it('decodes the five-byte little-endian seed', () => {
    expect(decodeSevenBitLittleEndian([0x67, 0x72, 0x43, 0x12, 0x0b])).toBe(2_991_651_175);
  });

  it('encodes a seed as the confirmed recall message', () => {
    expect(encodeSeedSysEx(2_592_449_932)).toEqual([
      0xf0, 0x6f, 0x62, 0x78, 0x10, 0x0c, 0x4b, 0x16, 0x54, 0x09, 0xf7,
    ]);
  });

  it('rejects seeds outside the unsigned 32-bit range', () => {
    expect(() => encodeSeedSysEx(0x1_0000_0000)).toThrow(RangeError);
  });

  it('encodes the confirmed current-state request', () => {
    expect(encodeStatusRequestSysEx()).toEqual([0xf0, 0x6f, 0x62, 0x78, 0x11, 0x00, 0xf7]);
  });

  it('parses a captured seed message', () => {
    expect(parseRndSysEx([0xf0, 0x6f, 0x62, 0x78, 0x10, 0x04, 0x79, 0x35, 0x60, 0x0d, 0xf7]))
      .toMatchObject({ kind: 'seed', seed: 3_691_871_364 });
  });

  it('decodes patch mode, tempo, captured root, and scale', () => {
    expect(parseRndSysEx([0xf0, 0x6f, 0x62, 0x78, 0x21, 0x00, 0x56, 0x00, 0x01, 0x05, 0xf7]))
      .toMatchObject({
        kind: 'global',
        metadata: {
          patchMode: 0,
          raw: [0, 86, 0, 1, 5],
          rootWhenCaptured: 1,
          scaleIndex: 5,
          tempoBpm: 86,
        },
      });
  });

  it('parses a null-terminated engine name', () => {
    expect(parseRndSysEx([
      0xf0, 0x6f, 0x62, 0x78, 0x22, 0, 1, 2, 0x50, 0x6c, 0x75, 0x63, 0x6b, 0x65, 0x64,
      0x20, 0x53, 0x74, 0x72, 0x69, 0x6e, 0x67, 0, 0xf7,
    ])).toMatchObject({
      kind: 'track',
      metadata: { engine: 'Plucked String', index: 0, role: 1, roleVariant: 2 },
    });
  });

  it('preserves unknown message types', () => {
    expect(parseRndSysEx([0xf0, 0x6f, 0x62, 0x78, 0x55, 1, 2, 0xf7]))
      .toMatchObject({ kind: 'unknown', messageType: 0x55, payload: [1, 2] });
  });

  it('rejects unrelated SysEx', () => {
    expect(parseRndSysEx([0xf0, 0x7d, 1, 0xf7])).toMatchObject({ kind: 'invalid' });
  });

  it('labels the observed sequence behaviors while preserving unknown values', () => {
    expect(getPatchModeLabel(0)).toBe('Running sequence · Mode 0');
    expect(getPatchModeLabel(1)).toBe('Running sequence · Mode 1');
    expect(getPatchModeLabel(2)).toBe('Preview only');
    expect(getPatchModeLabel(3)).toBe('Unknown mode (3)');
  });
});
