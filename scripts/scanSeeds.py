#!/usr/bin/env python3
"""Bounded RND Synth seed scanner using CoreMIDI through python-rtmidi."""

from __future__ import annotations

import argparse
import json
import secrets
import signal
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

RND_HEADER = [0xF0, 0x6F, 0x62, 0x78]
MAX_SEED = 0xFFFFFFFF


def encodeSeed(seed: int) -> list[int]:
    if seed < 0 or seed > MAX_SEED:
        raise ValueError("Seed must be an unsigned 32-bit integer.")
    payload: list[int] = []
    remaining = seed
    for _index in range(5):
        payload.append(remaining % 128)
        remaining //= 128
    return [*RND_HEADER, 0x10, *payload, 0xF7]


def decodeSeed(payload: list[int]) -> int:
    if len(payload) != 5:
        raise ValueError("Seed payload must contain five bytes.")
    return sum(byte * (128 ** index) for index, byte in enumerate(payload))


def decodeAscii(payload: list[int]) -> str:
    terminator = payload.index(0) if 0 in payload else len(payload)
    return bytes(payload[:terminator]).decode("ascii", errors="replace")


def parseRndMessage(message: list[int]) -> dict[str, Any] | None:
    if len(message) < 6 or message[:4] != RND_HEADER or message[-1] != 0xF7:
        return None
    messageType = message[4]
    payload = message[5:-1]
    if messageType == 0x10 and len(payload) == 5:
        return {"kind": "seed", "seed": decodeSeed(payload)}
    if messageType == 0x20:
        return {"kind": "patchStart"}
    if messageType == 0x21 and len(payload) == 5:
        return {
            "kind": "global",
            "valueA": payload[0],
            "valueB": payload[1],
            "valueC": payload[2],
            "tonicIndex": payload[3],
            "scaleIndex": payload[4],
            "raw": payload,
        }
    if messageType == 0x22 and len(payload) >= 4:
        return {
            "kind": "track",
            "index": payload[0],
            "valueA": payload[1],
            "valueB": payload[2],
            "engine": decodeAscii(payload[3:]),
            "raw": payload,
        }
    return {"kind": "unknown", "messageType": messageType, "payload": payload}


@dataclass
class Capture:
    requestedSeed: int
    startedAt: float = field(default_factory=time.monotonic)
    returnedSeed: int | None = None
    globalMetadata: dict[str, Any] | None = None
    tracks: dict[int, dict[str, Any]] = field(default_factory=dict)
    rawMessages: list[list[int]] = field(default_factory=list)
    lastReceivedAt: float | None = None

    def addMessage(self, message: list[int]) -> None:
        parsed = parseRndMessage(message)
        if parsed is None:
            return
        self.rawMessages.append(message)
        self.lastReceivedAt = time.monotonic()
        if parsed["kind"] == "seed":
            self.returnedSeed = parsed["seed"]
        elif parsed["kind"] == "global":
            self.globalMetadata = {key: value for key, value in parsed.items() if key != "kind"}
        elif parsed["kind"] == "track":
            trackIndex = parsed["index"]
            self.tracks[trackIndex] = {key: value for key, value in parsed.items() if key != "kind"}

    def toRecord(self, timedOut: bool) -> dict[str, Any]:
        seedMatches = self.returnedSeed == self.requestedSeed
        status = "timeout" if timedOut else "complete" if seedMatches else "seedMismatch"
        return {
            "capturedAt": datetime.now(timezone.utc).isoformat(),
            "durationMs": round((time.monotonic() - self.startedAt) * 1000, 2),
            "global": self.globalMetadata,
            "rawMessages": self.rawMessages,
            "requestedSeed": self.requestedSeed,
            "returnedSeed": self.returnedSeed,
            "status": status,
            "tracks": [self.tracks[index] for index in sorted(self.tracks)],
        }


class MidiScanner:
    def __init__(self, midiInput: Any, midiOutput: Any, settleSeconds: float, timeoutSeconds: float):
        self.condition = threading.Condition()
        self.currentCapture: Capture | None = None
        self.midiInput = midiInput
        self.midiOutput = midiOutput
        self.settleSeconds = settleSeconds
        self.timeoutSeconds = timeoutSeconds
        self.stopping = False
        midiInput.set_callback(self.handleMessage)

    def handleMessage(self, event: tuple[list[int], float], _userData: Any = None) -> None:
        message, _deltaTime = event
        if not message or message[0] != 0xF0:
            return
        with self.condition:
            if self.currentCapture is not None:
                self.currentCapture.addMessage(list(message))
                self.condition.notify_all()

    def scan(self, seed: int) -> dict[str, Any]:
        with self.condition:
            self.currentCapture = Capture(seed)
        self.midiOutput.send_message(encodeSeed(seed))
        deadline = time.monotonic() + self.timeoutSeconds
        timedOut = False
        with self.condition:
            while not self.stopping:
                now = time.monotonic()
                capture = self.currentCapture
                if capture is None:
                    break
                settled = (
                    capture.returnedSeed is not None
                    and capture.lastReceivedAt is not None
                    and now - capture.lastReceivedAt >= self.settleSeconds
                )
                if settled:
                    break
                if now >= deadline:
                    timedOut = True
                    break
                nextWake = min(deadline - now, self.settleSeconds)
                self.condition.wait(timeout=max(nextWake, 0.001))
            capture = self.currentCapture
            self.currentCapture = None
        if capture is None:
            raise RuntimeError("Capture ended unexpectedly.")
        return capture.toRecord(timedOut)

    def stop(self) -> None:
        with self.condition:
            self.stopping = True
            self.condition.notify_all()


def loadRtMidi() -> Any:
    try:
        import rtmidi
        return rtmidi
    except ModuleNotFoundError as error:
        raise RuntimeError(
            "python-rtmidi is not installed. Run: python3 -m venv .scanner-venv && "
            ".scanner-venv/bin/pip install -r requirements-scanner.txt"
        ) from error


def listPorts(midi: Any) -> tuple[list[str], list[str]]:
    midiInput = midi.MidiIn()
    midiOutput = midi.MidiOut()
    try:
        return midiInput.get_ports(), midiOutput.get_ports()
    finally:
        del midiInput
        del midiOutput


def findPort(ports: list[str], requestedName: str, direction: str) -> int:
    normalized = requestedName.casefold()
    exact = [index for index, name in enumerate(ports) if name.casefold() == normalized]
    matches = exact or [index for index, name in enumerate(ports) if normalized in name.casefold()]
    if not matches:
        available = ", ".join(ports) if ports else "none"
        raise RuntimeError(f"No {direction} port matched {requestedName!r}. Available: {available}")
    if len(matches) > 1:
        names = ", ".join(ports[index] for index in matches)
        raise RuntimeError(f"Multiple {direction} ports matched {requestedName!r}: {names}")
    return matches[0]


def generateSeeds(mode: str, count: int, startSeed: int) -> Iterable[int]:
    if mode == "sequential":
        for offset in range(count):
            yield (startSeed + offset) & MAX_SEED
        return
    seen: set[int] = set()
    while len(seen) < count:
        seed = secrets.randbits(32)
        if seed not in seen:
            seen.add(seed)
            yield seed


def loadSeedFile(path: Path) -> list[int]:
    seeds: list[int] = []
    seen: set[int] = set()
    for lineNumber, rawLine in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = rawLine.split("#", maxsplit=1)[0].strip()
        if not line:
            continue
        try:
            seed = int(line, 0)
        except ValueError as error:
            raise ValueError(f"Invalid seed on line {lineNumber} of {path}: {line!r}") from error
        if seed < 0 or seed > MAX_SEED:
            raise ValueError(f"Seed on line {lineNumber} of {path} is outside the unsigned 32-bit range.")
        if seed in seen:
            raise ValueError(f"Duplicate seed on line {lineNumber} of {path}: {seed}")
        seen.add(seed)
        seeds.append(seed)
    if not seeds:
        raise ValueError(f"Seed file contains no seeds: {path}")
    return seeds


def defaultOutputPath(mode: str) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return Path("scans") / f"rnd-{mode}-{stamp}.jsonl"


def parseArguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scan RND Synth seeds and log returned patch metadata as JSONL.")
    parser.add_argument("--count", type=int, default=10, help="Number of seeds to scan (default: 10).")
    parser.add_argument("--device", default="RND Synth", help="MIDI input/output name match.")
    parser.add_argument("--dry-run", action="store_true", help="Print seed messages without opening MIDI ports.")
    parser.add_argument("--interval-ms", type=int, default=500, help="Minimum delay after each response.")
    parser.add_argument("--list", action="store_true", help="List MIDI ports and exit.")
    parser.add_argument("--mode", choices=("random", "sequential"), default="random")
    parser.add_argument("--output", type=Path, help="JSONL output path; defaults under scans/.")
    parser.add_argument("--response-timeout-ms", type=int, default=1500)
    parser.add_argument("--seeds-file", type=Path, help="Explicit seeds, one decimal or 0x-prefixed value per line.")
    parser.add_argument("--settle-ms", type=int, default=100)
    parser.add_argument("--start-seed", type=int, default=0, help="First seed for sequential mode.")
    return parser.parse_args()


def validateArguments(args: argparse.Namespace) -> None:
    if args.count < 1:
        raise ValueError("--count must be at least 1.")
    if args.interval_ms < 100:
        raise ValueError("--interval-ms must be at least 100 to avoid flooding the synth.")
    if args.response_timeout_ms < args.settle_ms:
        raise ValueError("--response-timeout-ms must be greater than or equal to --settle-ms.")
    if args.start_seed < 0 or args.start_seed > MAX_SEED:
        raise ValueError("--start-seed must be an unsigned 32-bit integer.")


def main() -> int:
    args = parseArguments()
    try:
        validateArguments(args)
        seeds = loadSeedFile(args.seeds_file) if args.seeds_file else list(
            generateSeeds(args.mode, args.count, args.start_seed)
        )
        requestedCount = len(seeds)
        if args.dry_run:
            for seed in seeds:
                print(json.dumps({"seed": seed, "sysex": encodeSeed(seed)}))
            return 0

        midi = loadRtMidi()
        inputPorts, outputPorts = listPorts(midi)
        if args.list:
            print("Inputs:")
            for index, name in enumerate(inputPorts):
                print(f"  [{index}] {name}")
            print("Outputs:")
            for index, name in enumerate(outputPorts):
                print(f"  [{index}] {name}")
            return 0

        inputIndex = findPort(inputPorts, args.device, "input")
        outputIndex = findPort(outputPorts, args.device, "output")
        midiInput = midi.MidiIn()
        midiOutput = midi.MidiOut()
        midiInput.ignore_types(sysex=False, timing=True, active_sense=True)
        midiInput.open_port(inputIndex)
        midiOutput.open_port(outputIndex)
        scanner = MidiScanner(
            midiInput,
            midiOutput,
            args.settle_ms / 1000,
            args.response_timeout_ms / 1000,
        )
        stopEvent = threading.Event()

        def requestStop(_signalNumber: int, _frame: Any) -> None:
            stopEvent.set()
            scanner.stop()

        signal.signal(signal.SIGINT, requestStop)
        signal.signal(signal.SIGTERM, requestStop)
        outputPath = args.output or defaultOutputPath(args.mode)
        outputPath.parent.mkdir(parents=True, exist_ok=True)
        completed = 0
        try:
            with outputPath.open("a", encoding="utf-8") as outputFile:
                for seed in seeds:
                    if stopEvent.is_set():
                        break
                    record = scanner.scan(seed)
                    outputFile.write(json.dumps(record, separators=(",", ":")) + "\n")
                    outputFile.flush()
                    completed += 1
                    trackSummary = ", ".join(track["engine"] for track in record["tracks"]) or "no tracks"
                    print(f"[{completed}/{requestedCount}] {seed} {record['status']} | {trackSummary}")
                    if not stopEvent.is_set() and completed < requestedCount:
                        stopEvent.wait(args.interval_ms / 1000)
        finally:
            scanner.stop()
            midiInput.cancel_callback()
            midiInput.close_port()
            midiOutput.close_port()
            del midiInput
            del midiOutput
        print(f"Wrote {completed} records to {outputPath}")
        return 0 if completed == requestedCount else 130
    except (RuntimeError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
