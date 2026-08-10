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
