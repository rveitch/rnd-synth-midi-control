# Controlled contrast analysis

> Historical note: subsequent comparison with Seed Lab's MT19937 model decoded
> the global fields as patch mode, 14-bit tempo, root when captured, and scale,
> and the track pair as role and role variant. See
> [protocol.md](protocol.md) for the current interpretation.

Date: 2026-08-10

## Method

The metadata scan found five pairs with identical announced engine structure and exactly one differing announced field. A bounded probe alternated A/B recalls and captured eight seconds of MIDI behavior twice for every seed, producing 20 trials.

All 20 trials completed. Each seed produced the same Note On count, pitches, velocities, and musical event order in both trials. Timing generally repeated within approximately one millisecond. Initial stale Note Off messages from a preceding patch were excluded from musical conclusions.

## Playback mode contrast

The strongest pair contains one Noise track with identical remaining announced metadata:

| Seed | Mode | Notes in 8 seconds | Median Note On interval | Pitch range | Activity near end |
| --- | ---: | ---: | ---: | --- | --- |
| `4007357591` | 1 | 3 | 2,704 ms | 63–66 | No note in final quarter |
| `477` | 0 | 19 | 451 ms | 61–89 | Yes |

Both results repeated exactly. Mode `0` is therefore not inactive. In this pair it generates a substantially denser, faster, wider, and more velocity-varied repeating sequence than mode `1`.

This supports interpreting the first global byte as a sequence-mode category rather than a simple automatic-playback boolean:

- `0`: running sequence mode; exact behavioral name unknown
- `1`: running sequence mode; exact behavioral name unknown
- `2`: preview-only behavior in the labeled captures

One exact mode pair cannot establish that density or tempo is the field's universal meaning. More mode-only pairs are needed before naming modes `0` and `1` by musical behavior.

## Scale contrasts

Every observed pitch class in all three pairs belongs to the tonic and scale announced by that patch.

| Seed | Tonic and scale | Observed pitch classes |
| --- | --- | --- |
| `27925156` | C Lydian | D, A |
| `281` | C Persian | F |
| `3607040597` | A-flat Dorian | A-flat, E-flat |
| `1810040317` | A-flat Minor | A-flat, B-flat, B, E-flat, F-sharp |
| `3746425102` | B Phrygian Dominant | B, C, E-flat, F-sharp, A |
| `32771` | B Octatonic | B, C-sharp, D, F, A-flat |

The replicated MIDI evidence materially strengthens the current interpretation of global bytes four and five as tonic index and scale index using the existing note and scale-name tables.

Different note counts, rhythms, velocities, and voicings also appeared within these pairs. Those differences demonstrate that unannounced seed-derived parameters still vary, so they must not be attributed to scale alone.

## Global value B contrast

The pair contains one Speech track, preview-only mode `2`, tonic A-flat, scale Octatonic, and identical remaining announced metadata:

| Seed | Value B | Notes | Active span | Pitch range | Pattern |
| --- | ---: | ---: | ---: | --- | --- |
| `3985775430` | 35 | 5 | 828 ms | 43–47 | Five sequential notes, approximately 184 ms apart |
| `416` | 23 | 4 | 790 ms | 43–53 | Two overlapping two-note groups |

The difference repeated exactly, but it affects several observable dimensions simultaneously. This single pair cannot determine whether value B controls sequence length, density, rhythm, voicing, or another generator mode. Hidden seed-derived parameters remain a confounder.

## Conclusions

1. Seed recall reproduces complete MIDI behavior, not only announced metadata.
2. Global byte one is a multi-valued sequence-mode field; mode `0` and mode `1` can both generate ongoing sequences, while labeled mode `2` patches remain preview-only.
3. The tonic and scale decoding is strongly supported by captured pitches across three controlled pairs.
4. Global value B remains unidentified.
5. Exact announced-metadata matching reduces variables but does not eliminate hidden seed-derived parameters.

The next useful contrast search should target additional mode-only and global-value-B-only pairs. General scale contrasts have diminishing value now that captured pitches support the existing decoding.
