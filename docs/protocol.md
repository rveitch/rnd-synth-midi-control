# RND Synth protocol notes

These notes document the behavior observed from a Cyma Forma RND Synth and the
additional deterministic seed-generation model published by the third-party
[RND Seed Lab](https://redteam.fr/seed-lab/). The SysEx protocol is undocumented
by the manufacturer and may change with firmware.

## SysEx envelope

```text
F0 6F 62 78 <message type> <payload> F7
```

The three-byte identifier is ASCII `obx`.

### `0x10`: 32-bit seed

```text
F0 6F 62 78 10 b0 b1 b2 b3 b4 F7
```

The unsigned 32-bit seed is packed into five MIDI-safe, seven-bit values with
the least-significant group first:

```text
seed = b0 | (b1 << 7) | (b2 << 14) | (b3 << 21) | ((b4 & 0x0F) << 28)
```

The device broadcasts this frame when its seed changes and accepts the same
frame to recall that seed. Recall sends the seed only; the following metadata
is emitted by the device and is not replayed by this app.

### `0x20`: patch-description start

```text
F0 6F 62 78 20 F7
```

Observed immediately before the global and per-track metadata for a patch.

### `0x11`: request current state

```text
F0 6F 62 78 11 00 F7
```

This command makes the device resend its current seed, global metadata, and
active-track metadata. It also appears to clear a play-lock state and may cause
a brief audible mute. The web app sends it once after both MIDI ports have been
opened so a patch that predates the browser session appears in the inspector.
It is not used for periodic polling.

The payload byte is also a confirmed sequencer control:

- `01` stops the autonomous sequencer;
- `00` starts it again, apparently from the beginning, and resends state.

The UI therefore labels these actions **Stop** and **Start**, not Pause and
Resume. This behavior was manually verified against the hardware.

### `0x21`: global metadata

```text
F0 6F 62 78 21 mode tempoLow tempoHigh root scale F7
```

| Byte | App field | Meaning |
| --- | --- | --- |
| 0 | `patchMode` | `0` and `1` run sequences; `2` is preview/one-off |
| 1–2 | `tempoBpm` | 14-bit integer BPM: `tempoLow | tempoHigh << 7` |
| 3 | `rootWhenCaptured` | Current pitch class, `0`–`11` |
| 4 | `scaleIndex` | Index into the 20 observed scales |

`rootWhenCaptured` is deliberately not called `tonic`. Other independent
captures report that this byte can move while a patch runs. Immediately after
generation it has matched the seed model's initial tonic in our checked
captures, but a saved status frame is still only the root observed at capture
time.

### `0x22`: track metadata

```text
F0 6F 62 78 22 trackIndex role roleVariant <engine ASCII> 00 F7
```

| Byte | App field | Meaning |
| --- | --- | --- |
| 0 | `index` | Zero-based track index |
| 1 | `role` | Deterministic track-role category, observed values `0`–`3` |
| 2 | `roleVariant` | Deterministic role variant, observed values `0`–`2` |
| 3… | `engine` | NUL-terminated engine name |

The names `role` and `roleVariant` are supported by the deterministic generator
model and exact matches against saved hardware captures. Their musical meaning
is not yet established. In particular, `roleVariant` should not be labeled
polyphony, panning, or articulation without a controlled audible test.

## Deterministic seed generation

Seed Lab's published browser code models the firmware with an MT19937
(Mersenne Twister) pseudorandom number generator initialized from the unsigned
32-bit patch seed. A fixed sequence of random draws determines, in order:

1. patch mode;
2. tempo;
3. active track count;
4. track roles and role variants;
5. initial tonic and scale;
6. per-track sequences;
7. eligible engine pools, engine choices, and engine parameter draws.

This explains why adjacent numeric seeds do not form useful engine ranges. The
seed is an initializer, not a bit field whose numeric regions directly denote
engines. Targeted generation is nevertheless possible by reproducing the draw
order and filtering predicted patches locally.

The currently observed patch-mode selection bag is `[0, 0, 1, 1, 2]`, and the
track count is selected evenly from one through four. Engine eligibility also
depends on both patch mode and role:

| Engine | Eligible modes | Eligible roles |
| --- | --- | --- |
| Subtractive | 0, 1, 2 | 0, 1, 3 |
| FM | 0, 1, 2 | 0, 1, 3 |
| Acid (303) | 0, 2 | 0, 1 |
| Noise | 0, 1, 2 | 1, 2 |
| Speech | 0, 1, 2 | 0, 2, 3 |
| Plucked String | 0, 1, 2 | 0, 1, 2 |
| SuperSaw | 0, 1, 2 | 0, 1, 3 |
| Harmonic | 0, 1, 2 | 0, 1, 3 |

The source also consumes engine-specific random parameter vectors to maintain
the correct MT19937 state, but it does not identify those values as named synth
controls. We therefore do not claim that cutoff, envelopes, panning, polyphony,
or other engine parameters have been decoded.

## Evidence and confidence

- Seed packing, recall, patch mode, tempo packing, scale, engine names, and raw
  metadata frames have been checked against this project's hardware captures.
- Seed Lab's predicted role/variant pairs exactly matched the checked captures
  for seeds `1919318707`, `3607040585`, `510657109`, and `2194168469`.
- The complete MT19937 draw order and engine eligibility tables currently come
  from Seed Lab's readable deployed JavaScript. They should be independently
  regression-tested against more hardware captures before powering normal UI
  predictions.
- Seed Lab's deployed source does not currently include an apparent license or
  a discoverable public repository link. This project documents the observed
  protocol and behavior rather than copying its implementation.

Related experiment reports remain under `docs/` as dated records of what was
known when each test was performed.
