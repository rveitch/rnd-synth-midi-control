# Seed scan analysis: 1,000 patches

Date: 2026-08-10

## Method

The scanner sent 500 sequential seeds (`0` through `499`) followed by 500 unique, uniformly random unsigned 32-bit seeds. Requests were spaced 500 ms apart. A result was accepted only after the synth echoed the requested seed and returned its global and track metadata.

- Sequential results: `scans/sequential-0-499.jsonl`
- Random results: `scans/random-500.jsonl`
- Complete responses: 1,000 of 1,000
- Correct seed echoes: 1,000 of 1,000
- Unique requested seeds: 500 in each sample

The raw scan files are intentionally ignored by Git because they are generated experiment data.

## Main findings

### Nearby seeds do not form obvious parameter ranges

The 499 adjacent pairs in the sequential sample behaved similarly to adjacent rows in the random sample:

| Measurement | Sequential neighbors | Random-sample neighbors |
| --- | ---: | ---: |
| Same track count | 25.3% | 22.2% |
| Any engine in common | 51.3% | 52.1% |
| Identical ordered engine list | 1.0% | 0.4% |
| Same playback-mode value | 33.1% | 36.5% |
| Same tonic index | 9.8% | 7.6% |
| Same scale index | 5.6% | 4.4% |

Lags of 2, 4, 8, 16, 32, 64, 128, and 256 seeds also showed no stable repeating structure. Simple low-bit groupings (`seed modulo 2`, `4`, or `8`) had only weak association with track count, first engine, playback-mode value, tonic, and scale. The numeric seed had essentially no linear relationship with the middle global byte (`r = 0.010` sequentially and `r = 0.082` randomly).

This is consistent with the seed initializing a pseudo-random generator with good mixing. It does not prove the firmware algorithm is cryptographically random, but it argues strongly against useful contiguous ranges such as “Supersaw seeds live between X and Y.”

### Track count looks uniform; engine choice does not

Across all 1,000 patches, track counts were:

| Active tracks | Patches | Share |
| --- | ---: | ---: |
| 1 | 264 | 26.4% |
| 2 | 227 | 22.7% |
| 3 | 249 | 24.9% |
| 4 | 260 | 26.0% |

This is consistent with an even 1-to-4 selection. Engine occurrences across 2,505 active tracks were clearly weighted:

| Engine | Track occurrences | Share of tracks | Patches containing engine | Expected attempts to find one |
| --- | ---: | ---: | ---: | ---: |
| Plucked String | 411 | 16.4% | 34.9% | 2.9 |
| FM | 354 | 14.1% | 32.0% | 3.1 |
| Speech | 346 | 13.8% | 30.3% | 3.3 |
| Subtractive | 344 | 13.7% | 29.8% | 3.4 |
| Harmonic | 339 | 13.5% | 29.8% | 3.4 |
| SuperSaw | 334 | 13.3% | 30.5% | 3.3 |
| Noise | 239 | 9.5% | 22.3% | 4.5 |
| Acid (303) | 138 | 5.5% | 12.7% | 7.9 |

The last column estimates browser-side generate-and-filter performance. It is calculated from patch presence, not track share.

### The first global byte remains the strongest playback-mode candidate

The first global byte occurred with these frequencies:

| Raw value | Patches | Share | Current interpretation |
| --- | ---: | ---: | --- |
| 0 | 406 | 40.6% | Unknown |
| 1 | 403 | 40.3% | Automatically running sequence, based on labeled captures |
| 2 | 191 | 19.1% | Preview only, based on labeled captures |

The value had no meaningful relationship with track count or the other two unknown global values. The experiment did not capture note traffic or audio, so it cannot independently validate the playback behavior. A small manually labeled sample of value `0` patches is the next useful experiment.

### Track metadata values are structured engine properties

Only seven `(valueA, valueB)` pairs appeared in 2,505 tracks. Their allowed engine combinations were not arbitrary:

| Engine | Observed pairs |
| --- | --- |
| Acid (303) | `0/0`, `0/1`, `1/0`, `1/1`, `1/2` |
| FM | `0/0`, `0/1`, `1/0`, `1/1`, `1/2`, `3/2` |
| Harmonic | `0/0`, `0/1`, `1/0`, `1/1`, `1/2`, `3/2` |
| Noise | `1/0`, `1/1`, `1/2`, `2/0` |
| Plucked String | `0/0`, `0/1`, `1/0`, `1/1`, `1/2`, `2/0` |
| Speech | `0/0`, `0/1`, `2/0`, `3/2` |
| Subtractive | `0/0`, `0/1`, `1/0`, `1/1`, `1/2`, `3/2` |
| SuperSaw | `0/0`, `0/1`, `1/0`, `1/1`, `1/2`, `3/2` |

This is strong evidence that these bytes encode categorical track behavior or capabilities rather than unrelated continuous values. The data do not yet justify naming either field “panning,” “polyphony,” or “sequencing.” Controlled audible labels are still needed.

## Product implication

Deterministically computing a patch's parameters from its seed would likely require extracting or reproducing the firmware's pseudo-random algorithm and its complete patch-generation order. The scan does not reveal that algorithm.

A practical constrained generator is realistic now: generate a random seed, send it, inspect the returned metadata, and keep or automatically reroll based on known criteria. Engine, track count, probable tonic/scale, and the provisional playback-mode byte can all be filtered this way. Unknown properties can be added once controlled captures give their metadata values reliable names.

Any automatic reroll feature should remain bounded, rate-limited, cancellable, and visibly report how many candidates it tried.
