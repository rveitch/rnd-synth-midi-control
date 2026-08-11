# RND Synth MIDI Control

<img width="1293" height="1235" alt="image" src="https://github.com/user-attachments/assets/ab83941d-4864-44e2-9554-90fe4f95e77c" />

Browser-based MIDI control and patch inspection for the [Cyma Forma RND Synth](https://www.cymaforma.com/rnd-synth).

The app connects through Web MIDI, receives patch SysEx after a button press, and displays the decoded seed, probable tonic and scale, active tracks, engine names, unknown values, and raw messages. Completed patches are stored locally in a deduplicated 100-entry history and can be recalled by seed.

Patches can be named and copied into a separate durable library that is not affected by history eviction or clearing. History and library collections have separate, versioned JSON import/export formats so their data can support a dedicated library view in a future release.

Undocumented patch metadata remains receive-only. The one confirmed exception is the `10` seed message, which the synth accepts to recall a generated patch.

## Development

```sh
npm install
npm run dev
```

Use a desktop browser with Web MIDI support in a secure context, connect the USB device, then approve MIDI and SysEx access.

## Validation

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

## Observed protocol

```text
F0 6F 62 78 <message type> <payload> F7
```

- `10`: five-byte, seven-bit-safe little-endian random seed
- `20`: patch-start marker
- `21`: five bytes of global metadata
- `22`: active-track index, two unknown values, and a null-terminated engine name

Seed recall sends only the `10` message. Global and track metadata are never replayed.

The last two global bytes are provisionally shown as tonic and scale index until controlled captures confirm them.

The first global byte is provisionally decoded from labeled captures as playback mode: `1` automatically runs the generated sequence, `2` plays only the initial preview, and `0` remains unknown.

The **Generate patch** control creates a uniformly random unsigned 32-bit seed with the browser's secure random generator and sends the confirmed seed-recall message. The synth's response follows the normal inspection, history, and library workflow.

## Seed scanner

The bounded command-line scanner sends seeds through CoreMIDI, verifies the seed echoed by the synth, assembles the returned patch metadata, and appends one durable JSONL record per request. It never sends undocumented messages other than the confirmed seed command.

Set up its isolated Python environment once:

```sh
python3 -m venv .scanner-venv
.scanner-venv/bin/pip install -r requirements-scanner.txt
```

List ports without sending data:

```sh
npm run scan:seeds -- --list
```

Run bounded sequential and random samples:

```sh
npm run scan:seeds -- --mode sequential --start-seed 0 --count 500
npm run scan:seeds -- --mode random --count 500
```

Run a designed cohort from a text file containing one decimal or `0x`-prefixed seed per line:

```sh
npm run scan:seeds -- --seeds-file scans/my-seeds.txt --output scans/my-results.jsonl
```

Results default to timestamped files under `scans/`, which is ignored by Git. Use `--output <path>` to choose a different JSONL file. The scanner defaults to a 500 ms interval, rejects intervals below 100 ms, times out individual requests, flushes every record immediately, and closes both ports on completion or interruption. Mute or turn down the synth before large runs because every candidate patch may be audible.

Run the scanner protocol tests with:

```sh
npm run test:scanner
```

Run the bounded transport probe against a known automatically running patch:

```sh
npm run probe:transport -- --seed 4007357591
```

The probe measures emitted note traffic before and after MIDI Stop, Continue, and Start, writes a JSON event log under `scans/`, restores the sequence with Start, and exits automatically.

Run repeated behavioral captures for the strongest exact metadata contrasts:

```sh
npm run probe:contrasts
```

The contrast probe alternates A/B recalls, captures eight seconds of MIDI per seed, flushes each trial to `scans/contrast-probe.json`, and exits after the bounded set completes.
