#!/usr/bin/env python3
"""Bounded MIDI transport probe for the RND Synth."""

from __future__ import annotations

import argparse
import json
import signal
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from scripts.scanSeeds import encodeSeed, findPort, listPorts, loadRtMidi
except ModuleNotFoundError:
    from scanSeeds import encodeSeed, findPort, listPorts, loadRtMidi

TRANSPORT_MESSAGES = {
    "continue": [0xFB],
    "start": [0xFA],
    "stop": [0xFC],
}


def classifyMessage(message: list[int]) -> str:
    if not message:
        return "empty"
    status = message[0]
    messageType = status & 0xF0
    if messageType == 0x90 and len(message) >= 3:
        return "noteOff" if message[2] == 0 else "noteOn"
    if messageType == 0x80 and len(message) >= 3:
        return "noteOff"
    if messageType == 0xB0 and len(message) >= 3 and message[1] == 123:
        return "allNotesOff"
    if status == 0xF8:
        return "clock"
    if status == 0xFA:
        return "start"
    if status == 0xFB:
        return "continue"
    if status == 0xFC:
        return "stop"
    if status == 0xF0:
        return "sysex"
    return "other"


class EventCapture:
    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []
        self.lock = threading.Lock()
        self.phase = "setup"
        self.startedAt = time.monotonic()

    def setPhase(self, phase: str) -> None:
        with self.lock:
            self.phase = phase

    def handleMessage(self, event: tuple[list[int], float], _userData: Any = None) -> None:
        message, _deltaTime = event
        with self.lock:
            self.events.append({
                "elapsedMs": round((time.monotonic() - self.startedAt) * 1000, 2),
                "kind": classifyMessage(message),
                "message": list(message),
                "phase": self.phase,
            })

    def snapshot(self) -> list[dict[str, Any]]:
        with self.lock:
            return list(self.events)


def summarize(events: list[dict[str, Any]], phases: list[str]) -> dict[str, dict[str, int]]:
    summary: dict[str, dict[str, int]] = {}
    for phase in phases:
        counts: dict[str, int] = {}
        for event in events:
            if event["phase"] != phase:
                continue
            kind = event["kind"]
            counts[kind] = counts.get(kind, 0) + 1
        summary[phase] = counts
    return summary


def parseArguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Measure RND Synth note output around MIDI transport commands.")
    parser.add_argument("--device", default="RND Synth")
    parser.add_argument("--output", type=Path, default=Path("scans/transport-probe.json"))
    parser.add_argument("--phase-seconds", type=float, default=4.0)
    parser.add_argument("--seed", type=int, default=4_007_357_591)
    parser.add_argument("--settle-seconds", type=float, default=2.0)
    return parser.parse_args()


def main() -> int:
    args = parseArguments()
    if args.phase_seconds < 1 or args.settle_seconds < 0:
        print("Error: phase duration must be at least one second and settle duration cannot be negative.", file=sys.stderr)
        return 1

    midi = loadRtMidi()
    inputPorts, outputPorts = listPorts(midi)
    inputIndex = findPort(inputPorts, args.device, "input")
    outputIndex = findPort(outputPorts, args.device, "output")
    midiInput = midi.MidiIn()
    midiOutput = midi.MidiOut()
    capture = EventCapture()
    stopping = threading.Event()

    def requestStop(_signalNumber: int, _frame: Any) -> None:
        stopping.set()

    signal.signal(signal.SIGINT, requestStop)
    signal.signal(signal.SIGTERM, requestStop)
    midiInput.ignore_types(sysex=False, timing=False, active_sense=True)
    midiInput.set_callback(capture.handleMessage)
    midiInput.open_port(inputIndex)
    midiOutput.open_port(outputIndex)
    phases = ["baseline", "afterStop", "afterContinue", "afterSecondStop", "afterStart"]
    commands: list[dict[str, Any]] = []

    def send(label: str, message: list[int]) -> None:
        commands.append({
            "elapsedMs": round((time.monotonic() - capture.startedAt) * 1000, 2),
            "label": label,
            "message": message,
        })
        midiOutput.send_message(message)

    try:
        send("recallSeed", encodeSeed(args.seed))
        if stopping.wait(args.settle_seconds):
            return 130
        capture.setPhase("baseline")
        if stopping.wait(args.phase_seconds):
            return 130
        send("stop", TRANSPORT_MESSAGES["stop"])
        capture.setPhase("afterStop")
        if stopping.wait(args.phase_seconds):
            return 130
        send("continue", TRANSPORT_MESSAGES["continue"])
        capture.setPhase("afterContinue")
        if stopping.wait(args.phase_seconds):
            return 130
        send("stop", TRANSPORT_MESSAGES["stop"])
        capture.setPhase("afterSecondStop")
        if stopping.wait(args.phase_seconds):
            return 130
        send("start", TRANSPORT_MESSAGES["start"])
        capture.setPhase("afterStart")
        stopping.wait(args.phase_seconds)
    finally:
        midiInput.cancel_callback()
        midiInput.close_port()
        midiOutput.close_port()
        del midiInput
        del midiOutput

    events = capture.snapshot()
    record = {
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "commands": commands,
        "device": args.device,
        "events": events,
        "phaseSeconds": args.phase_seconds,
        "seed": args.seed,
        "settleSeconds": args.settle_seconds,
        "summary": summarize(events, phases),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(record["summary"], indent=2))
    print(f"Wrote transport probe to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
