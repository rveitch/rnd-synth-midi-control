# Designed seed tests

Date: 2026-08-10

This follow-up extends the initial 1,000-patch scan with 906 requests designed to reveal structure that a simple `0` through `499` sequence could miss. All 906 requests completed, and every synth response echoed the requested seed correctly.

Together with the original experiment, the dataset contains 1,906 successful requests representing 1,858 unique seeds. Forty-eight seeds were deliberately repeated to test determinism.

## Test design

### Boundary and bit-pattern cohort

The 258-seed cohort included:

- Values immediately surrounding every power of two
- Single-bit values and their 32-bit complements
- Values near zero and `0xFFFFFFFF`
- Alternating and repeated-byte patterns such as `0xAAAAAAAA`, `0x55555555`, and `0x01010101`

Purpose: detect discontinuities, bit fields, or especially influential seed bits.

### Full-range deterministic spread

The 256-seed cohort used repeated addition of `0x9E3779B9` modulo `2^32`. This golden-ratio-derived stride distributes a small deterministic sample throughout the complete unsigned 32-bit range without behaving like another contiguous sequence.

Purpose: detect broad regional differences that the original low-valued sequential sample could not expose.

### Known-patch neighborhoods

Four 49-seed windows covered each known seed plus or minus 24:

- Preview only: `3607040585`
- Preview only: `1919318707`
- Observed panning: `510657109`
- Observed panning: `2194168469`

Purpose: test whether nearby seeds inherit playback mode, engine, track count, or metadata from an interesting patch.

### Independent control neighborhoods

Four additional 49-seed windows were selected before scanning by hashing fixed labels. Their centers were `791931727`, `2080697221`, `3167422390`, and `3843932445`.

Purpose: confirm or reject apparent clustering discovered in the known-patch neighborhoods.

## Results

### Seed recall is exactly deterministic

All 48 seeds repeated from the original experiment returned byte-for-byte identical SysEx messages. This confirms that the captured metadata is completely reproducible from the seed under the tested synth state.

### Small numeric and one-bit changes produce unrelated metadata

None of the 189 power-of-two center-versus-neighbor comparisons produced identical metadata or an identical ordered engine list. Their engine overlap, track-count match, and playback-mode match rates remained near the earlier random baselines.

The 32 single-bit-versus-complement comparisons also produced no identical metadata or ordered engine lists.

Across all 1,858 unique seeds, each of the 32 seed bits was tested against track count, playback mode, first engine, tonic, and scale. After correcting for searching all 32 bits, no association was statistically significant:

| Output | Strongest candidate bit | Family-wise permutation result |
| --- | ---: | ---: |
| Track count | 22 | `p ≈ 0.39` |
| Playback mode | 2 | `p ≈ 0.79` |
| First engine | 30 | `p ≈ 0.96` |
| Tonic | 17 | `p ≈ 0.15` |
| Scale | 13 | `p ≈ 0.09` |

The slightly lower scale result is still above conventional significance and should not be treated as a decoded bit.

### No convincing broad seed regions appeared

Dividing the full-range spread cohort into four numeric quartiles produced ordinary sampling variation, but no consistent change in track count, playback mode, or engine distribution. No cohort contained duplicate complete metadata fingerprints.

This further weakens the theory that useful engine or behavior ranges occupy broad contiguous sections of the seed space.

### Interesting patches do not have similar immediate neighbors

For every labeled center seed, none of its 48 neighbors reproduced the complete metadata or ordered engine list. Center-versus-neighbor engine overlap and track-count matches were comparable to the original random baseline.

The four known neighborhoods initially showed more adjacent matches in the provisional playback-mode byte than expected (`87` of `192`, permutation `p ≈ 0.006`). This did not replicate in four independently selected control neighborhoods (`65` of `192`, `p ≈ 0.74`). The original result is therefore best treated as a localized anomaly or a selection effect, not a general seed rule.

The preview-only centers remain playback-mode value `2`. Their neighboring value-`2` rates were not unusually high:

- Around `3607040585`: 7 of 48 neighbors
- Around `1919318707`: 10 of 48 neighbors
- Original overall baseline: 19.1%

The panning centers also did not produce nearby patches with matching complete track metadata. Audio was not captured, so this experiment cannot directly label which neighbors pan.

## Conclusion

These tests found strong seed determinism but no useful arithmetic mapping from visible seed features to patch metadata. The firmware appears to mix nearby values well before making patch choices. More scans of numeric ranges are unlikely to unlock direct parameter prediction efficiently.

The productive direction is metadata-driven rejection sampling:

1. Generate a candidate seed.
2. Send the confirmed seed SysEx message.
3. Read the returned global and track metadata.
4. Accept a matching patch or reroll within a visible, cancellable attempt limit.

This can already constrain known fields such as engine, track count, tonic, scale, and provisional playback mode. Further controlled listening experiments should focus on naming the two categorical track bytes and global value `0`, rather than searching for numeric seed ranges.
