import { describe, expect, it } from 'vitest';
import { RndPatchAssembler } from './patchAssembler';
import { parseRndSysEx } from './rndProtocol';

describe('RndPatchAssembler', () => {
  it('supports variable active-track counts and finalizes on the next seed', () => {
    const assembler = new RndPatchAssembler();
    assembler.push(parseRndSysEx([0xf0, 0x6f, 0x62, 0x78, 0x10, 0x24, 0x2a, 0x55, 0x4c, 2, 0xf7]));
    assembler.push(parseRndSysEx([0xf0, 0x6f, 0x62, 0x78, 0x20, 0xf7]));
    assembler.push(parseRndSysEx([0xf0, 0x6f, 0x62, 0x78, 0x21, 0, 0x0f, 1, 8, 0x0e, 0xf7]));
    assembler.push(parseRndSysEx([0xf0, 0x6f, 0x62, 0x78, 0x22, 0, 0, 1, 0x46, 0x4d, 0, 0xf7]));
    assembler.push(parseRndSysEx([0xf0, 0x6f, 0x62, 0x78, 0x22, 1, 0, 0, 0x53, 0x70, 0x65, 0x65, 0x63, 0x68, 0, 0xf7]));

    const completed = assembler.push(parseRndSysEx([0xf0, 0x6f, 0x62, 0x78, 0x10, 0x61, 0x14, 0x4f, 0x66, 0x0e, 0xf7]));
    expect(completed).toMatchObject({
      seed: 697_652_516,
      tracks: [{ engine: 'FM', index: 0 }, { engine: 'Speech', index: 1 }],
    });
    expect(assembler.snapshot()).toMatchObject({ seed: 3_973_302_881, tracks: [] });
  });
});
