# RND Synth MIDI Control

Browser-based MIDI control and patch inspection for the Cyma Forma RND Synth.

## Conventions

- Use Vue 3, TypeScript, and the Composition API.
- Keep MIDI transport separate from Vue components.
- Treat undocumented SysEx as receive-only except for the confirmed `0x10` seed-recall command.
- Preserve unknown payload fields and raw bytes until verified.
- Prefer named function declarations for module-level functions.
- Avoid unary increment and decrement operators.
- Prefer `RND Synth`, but allow manual MIDI port selection.
- Keep rolling patch history and the durable named library as separate versioned storage contracts.
- Future views are expected to include a dedicated Library and Editor; do not couple collection data to the current dashboard layout.

## Validation

Run tests, type checking, lint, build, and `git diff --check` before handoff.
