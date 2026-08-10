# RND Synth MIDI Control

Browser-based MIDI control and patch inspection for the [Cyma Forma RND Synth](https://www.cymaforma.com/rnd-synth).

The current scaffold connects through Web MIDI, receives patch SysEx after a button press, and displays the decoded seed, probable tonic and scale, active tracks, engine names, unknown values, and raw messages.

Undocumented SysEx is receive-only. Captured messages are never replayed to the synth.

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

The last two global bytes are provisionally shown as tonic and scale index until controlled captures confirm them.
