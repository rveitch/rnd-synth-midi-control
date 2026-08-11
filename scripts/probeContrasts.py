#!/usr/bin/env python3
"""Capture repeated MIDI behavior for exact announced-metadata contrast pairs."""

from __future__ import annotations

import argparse
import json
import signal
import statistics
import sys
import threading
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from scripts.probeTransport import classifyMessage
    from scripts.scanSeeds import encodeSeed, findPort, listPorts, loadRtMidi
except ModuleNotFoundError:
    from probeTransport import classifyMessage
    from scanSeeds import encodeSeed, findPort, listPorts, loadRtMidi

CONTRASTS = [
    {"field": "global.mode", "a": 4_007_357_591, "b": 477},
    {"field": "global.valueB", "a": 3_985_775_430, "b": 416},
    {"field": "scale", "a": 27_925_156, "b": 281},
    {"field": "scale", "a": 3_607_040_597, "b": 1_810_040_317},
    {"field": "scale", "a": 3_746_425_102, "b": 32_771},
]


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = round((len(ordered) - 1) * fraction)
    return round(ordered[index], 2)


def summarizeTrial(events: list[dict[str, Any]], durationSeconds: float) -> dict[str, Any]:
    noteOns = [event for event in events if event["kind"] == "noteOn"]
    noteOffs = [event for event in events if event["kind"] == "noteOff"]
    times = [event["trialElapsedMs"] for event in noteOns]
    intervals = [later - earlier for earlier, later in zip(times, times[1:])]
    pitches = [event["message"][1] for event in noteOns]
    velocities = [event["message"][2] for event in noteOns]
    channels = [event["message"][0] & 0x0F for event in noteOns]
    return {
        "activeInFinalQuarter": any(value >= durationSeconds * 750 for value in times),
        "channels": dict(sorted(Counter(channels).items())),
        "firstNoteMs": round(times[0], 2) if times else None,
        "intervalMedianMs": round(statistics.median(intervals), 2) if intervals else None,
        "intervalP25Ms": percentile(intervals, 0.25),
        "intervalP75Ms": percentile(intervals, 0.75),
        "lastNoteMs": round(times[-1], 2) if times else None,
        "noteOffCount": len(noteOffs),
        "noteOnCount": len(noteOns),
        "pitchClasses": dict(sorted(Counter(pitch % 12 for pitch in pitches).items())),
        "pitchMaximum": max(pitches) if pitches else None,
        "pitchMinimum": min(pitches) if pitches else None,
        "velocityMedian": round(statistics.median(velocities), 2) if velocities else None,
    }


class TrialCapture:
    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []
        self.lock = threading.Lock()
        self.trialId: str | None = None
        self.trialStartedAt = 0.0

    def begin(self, trialId: str) -> None:
        with self.lock:
            self.trialId = trialId
            self.trialStartedAt = time.monotonic()

    def end(self) -> list[dict[str, Any]]:
        with self.lock:
            trialId = self.trialId
            self.trialId = None
            return [event for event in self.events if event["trialId"] == trialId]

    def handleMessage(self, event: tuple[list[int], float], _userData: Any = None) -> None:
        message, _deltaTime = event
        with self.lock:
            if self.trialId is None:
                return
            self.events.append({
                "kind": classifyMessage(message),
                "message": list(message),
                "trialElapsedMs": round((time.monotonic() - self.trialStartedAt) * 1000, 2),
                "trialId": self.trialId,
            })


def parseArguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture repeated behavior for exact metadata contrast pairs.")
    parser.add_argument("--device", default="RND Synth")
    parser.add_argument("--duration-seconds", type=float, default=8.0)
    parser.add_argument("--gap-seconds", type=float, default=0.5)
    parser.add_argument("--output", type=Path, default=Path("scans/contrast-probe.json"))
    parser.add_argument("--repeats", type=int, default=2)
    return parser.parse_args()


def writeRecord(path: Path, record: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    args = parseArguments()
    if args.duration_seconds < 2 or args.gap_seconds < 0 or args.repeats < 1:
        print("Error: duration must be at least two seconds, gap cannot be negative, and repeats must be positive.", file=sys.stderr)
        return 1
    midi = loadRtMidi()
    inputPorts, outputPorts = listPorts(midi)
    inputIndex = findPort(inputPorts, args.device, "input")
    outputIndex = findPort(outputPorts, args.device, "output")
    midiInput = midi.MidiIn()
    midiOutput = midi.MidiOut()
    capture = TrialCapture()
    stopping = threading.Event()

    def requestStop(_signalNumber: int, _frame: Any) -> None:
        stopping.set()

    signal.signal(signal.SIGINT, requestStop)
    signal.signal(signal.SIGTERM, requestStop)
    midiInput.ignore_types(sysex=False, timing=False, active_sense=True)
    midiInput.set_callback(capture.handleMessage)
    midiInput.open_port(inputIndex)
    midiOutput.open_port(outputIndex)
    record: dict[str, Any] = {
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "contrasts": CONTRASTS,
        "durationSeconds": args.duration_seconds,
        "repeats": args.repeats,
        "trials": [],
    }
    totalTrials = len(CONTRASTS) * args.repeats * 2
    completed = 0
    try:
        for contrastIndex, contrast in enumerate(CONTRASTS):
            for repeat in range(args.repeats):
                for side in ("a", "b"):
                    if stopping.is_set():
                        break
                    seed = contrast[side]
                    trialId = f"{contrastIndex}-{repeat}-{side}"
                    capture.begin(trialId)
                    midiOutput.send_message(encodeSeed(seed))
                    stopping.wait(args.duration_seconds)
                    events = capture.end()
                    trial = {
                        "contrastIndex": contrastIndex,
                        "events": events,
                        "field": contrast["field"],
                        "repeat": repeat,
                        "seed": seed,
                        "side": side,
                        "summary": summarizeTrial(events, args.duration_seconds),
                    }
                    record["trials"].append(trial)
                    completed += 1
                    writeRecord(args.output, record)
                    print(f"[{completed}/{totalTrials}] {contrast['field']} {side.upper()} seed {seed}: "
                          f"{trial['summary']['noteOnCount']} Note On", flush=True)
                    if completed < totalTrials:
                        stopping.wait(args.gap_seconds)
                if stopping.is_set():
                    break
            if stopping.is_set():
                break
    finally:
        midiInput.cancel_callback()
        midiInput.close_port()
        midiOutput.close_port()
        del midiInput
        del midiOutput
    print(f"Wrote {completed} trials to {args.output}")
    return 0 if completed == totalTrials else 130


if __name__ == "__main__":
    raise SystemExit(main())
