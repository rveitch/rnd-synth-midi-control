# MIDI transport probe

Date: 2026-08-10

## Method

The bounded probe recalled a confirmed playback-mode `1` patch, captured its emitted MIDI events, and divided the capture into equal four-second phases:

1. Baseline
2. After MIDI Stop (`FC`)
3. After MIDI Continue (`FB`)
4. After a second MIDI Stop
5. After MIDI Start (`FA`)

It was run against three patches, including two dense four-track patches:

- `4007357591`: one Noise track
- `510657094`: Speech, Harmonic, Subtractive, and SuperSaw
- `1919318695`: Subtractive, Noise, SuperSaw, and Plucked String

The script records every incoming MIDI message and exits automatically. It sends Start at the end so the final transport state is running.

## Results

### Stop is recognized but does not stop the autonomous sequence

Each of the six Stop commands caused the synth to emit exactly four All Notes Off messages (`CC 123`) on MIDI channels 1 through 4 within a few milliseconds.

Despite that response, new Note On messages continued during every four-second after-Stop phase:

| Seed | Baseline Note On | After first Stop | After second Stop |
| --- | ---: | ---: | ---: |
| `4007357591` | 2 | 1 | 1 |
| `510657094` | 13 | 15 | 15 |
| `1919318695` | 17 | 20 | 20 |

The single-track patch has a slow sequence, accounting for its lower counts. Its Note On events remained on their approximately 2.7-second schedule across Stop.

### Continue does not produce an observable transport transition

Continue caused no immediate response message and did not interrupt or materially change note generation. This is expected if Stop only performs an All Notes Off action rather than changing the sequencer's running state.

### Start may reset sequence phase

Start caused no response message. The captures suggest that it may reset or delay the next sequencer step, but the current four-second windows are too short to separate a phase reset from ordinary rhythmic variation. A dedicated timing test should evaluate this with longer captures.

## Confirmed protocol behavior

- Incoming `FC`: recognized; synth emits `B0 7B 00`, `B1 7B 00`, `B2 7B 00`, and `B3 7B 00`.
- Incoming `FC`: does not stop autonomous patch note generation.
- Incoming `FB`: no captured response and no measurable change to note generation.
- Incoming `FA`: no captured response; possible sequence-phase reset remains unconfirmed.

## Next systematic test

Supply a bounded 24-PPQN MIDI Clock stream at several tempos while measuring Note On timing. This will determine whether Start and Continue require external clock and whether the RND Synth can synchronize its autonomous sequences to standard MIDI Clock.
