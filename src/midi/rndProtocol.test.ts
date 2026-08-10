import { describe, expect, it } from 'vitest';
import { decodeSevenBitLittleEndian, parseRndSysEx } from './rndProtocol';

describe('RND Synth SysEx protocol', () => {
  it('decodes the five-byte little-endian seed', () => {
    expect(decodeSevenBitLittleEndian([0x67, 0x72, 0x43, 0x12, 0x0b])).toBe(2_991_651_175);
  });

  it('parses a captured seed message', () => {
    expect(parseRndSysEx([0xf0, 0x6f, 0x62, 0x78, 0x10, 0x04, 0x79, 0x35, 0x60, 0x0d, 0xf7]))
      .toMatchObject({ kind: 'seed', seed: 3_691_871_364 });
  });

  it('keeps unknown global fields alongside probable tonic and scale', () => {
    expect(parseRndSysEx([0xf0, 0x6f, 0x62, 0x78, 0x21, 0x00, 0x56, 0x00, 0x01, 0x05, 0xf7]))
      .toMatchObject({
        kind: 'global',
        metadata: { raw: [0, 86, 0, 1, 5], scaleIndex: 5, tonicIndex: 1, valueA: 0, valueB: 86, valueC: 0 },
      });
  });

  it('parses a null-terminated engine name', () => {
    expect(parseRndSysEx([
      0xf0, 0x6f, 0x62, 0x78, 0x22, 0, 1, 2, 0x50, 0x6c, 0x75, 0x63, 0x6b, 0x65, 0x64,
      0x20, 0x53, 0x74, 0x72, 0x69, 0x6e, 0x67, 0, 0xf7,
    ])).toMatchObject({ kind: 'track', metadata: { engine: 'Plucked String', index: 0, valueA: 1, valueB: 2 } });
  });

  it('preserves unknown message types', () => {
    expect(parseRndSysEx([0xf0, 0x6f, 0x62, 0x78, 0x55, 1, 2, 0xf7]))
      .toMatchObject({ kind: 'unknown', messageType: 0x55, payload: [1, 2] });
  });

  it('rejects unrelated SysEx', () => {
    expect(parseRndSysEx([0xf0, 0x7d, 1, 0xf7])).toMatchObject({ kind: 'invalid' });
  });
});
