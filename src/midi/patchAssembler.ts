import type { RndPatch, RndProtocolMessage } from './rndProtocol';

interface PendingPatch {
  global: RndPatch['global'];
  rawMessages: number[][];
  seed: number;
  tracks: RndPatch['tracks'];
}

export class RndPatchAssembler {
  private pending: PendingPatch | null = null;

  push(message: RndProtocolMessage): RndPatch | null {
    if (message.kind === 'invalid') return null;
    if (message.kind === 'seed') {
      const completed = this.complete();
      this.pending = { global: null, rawMessages: [[...message.raw]], seed: message.seed, tracks: [] };
      return completed;
    }
    if (this.pending === null) return null;
    this.pending.rawMessages.push([...message.raw]);
    if (message.kind === 'patchStart') {
      this.pending.global = null;
      this.pending.tracks = [];
    } else if (message.kind === 'global') {
      this.pending.global = message.metadata;
    } else if (message.kind === 'track') {
      const others = this.pending.tracks.filter((track) => track.index !== message.metadata.index);
      this.pending.tracks = [...others, message.metadata].sort((left, right) => left.index - right.index);
    }
    return null;
  }

  snapshot(): RndPatch | null {
    return this.pending === null ? null : this.toPatch(this.pending);
  }

  complete(): RndPatch | null {
    if (this.pending === null) return null;
    const patch = this.toPatch(this.pending);
    this.pending = null;
    return patch;
  }

  private toPatch(pending: PendingPatch): RndPatch {
    return {
      capturedAt: new Date().toISOString(),
      global: pending.global === null ? null : { ...pending.global, raw: [...pending.global.raw] },
      rawMessages: pending.rawMessages.map((message) => [...message]),
      seed: pending.seed,
      tracks: pending.tracks.map((track) => ({ ...track, raw: [...track.raw] })),
    };
  }
}
