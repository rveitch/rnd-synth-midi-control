import tempfile
import unittest
from pathlib import Path

from scripts.scanSeeds import Capture, decodeSeed, encodeSeed, loadSeedFile, parseRndMessage
from scripts.probeTransport import classifyMessage, summarize
from scripts.probeContrasts import summarizeTrial


class SeedProtocolTests(unittest.TestCase):
    def testKnownSeedEncoding(self) -> None:
        message = encodeSeed(1_120_108_670)
        self.assertEqual(message, [0xF0, 0x6F, 0x62, 0x78, 0x10, 0x7E, 0x00, 0x0E, 0x16, 0x04, 0xF7])
        self.assertEqual(decodeSeed(message[5:-1]), 1_120_108_670)

    def testPatchMetadataAssembly(self) -> None:
        capture = Capture(0)
        capture.addMessage([0xF0, 0x6F, 0x62, 0x78, 0x10, 0, 0, 0, 0, 0, 0xF7])
        capture.addMessage([0xF0, 0x6F, 0x62, 0x78, 0x21, 2, 5, 1, 3, 1, 0xF7])
        capture.addMessage([
            0xF0, 0x6F, 0x62, 0x78, 0x22, 0, 0, 0,
            *b"SuperSaw", 0, 0xF7,
        ])
        record = capture.toRecord(timedOut=False)
        self.assertEqual(record["status"], "complete")
        self.assertEqual(record["global"]["valueA"], 2)
        self.assertEqual(record["tracks"][0]["engine"], "SuperSaw")

    def testUnrelatedSysexIsIgnored(self) -> None:
        self.assertIsNone(parseRndMessage([0xF0, 0x7D, 1, 0xF7]))

    def testExplicitSeedFile(self) -> None:
        with tempfile.TemporaryDirectory() as temporaryDirectory:
            path = Path(temporaryDirectory) / "seeds.txt"
            path.write_text("0\n0xFFFFFFFF # maximum\n1120108670\n", encoding="utf-8")
            self.assertEqual(loadSeedFile(path), [0, 0xFFFFFFFF, 1_120_108_670])

    def testDuplicateSeedFileEntryIsRejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporaryDirectory:
            path = Path(temporaryDirectory) / "seeds.txt"
            path.write_text("42\n0x2A\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Duplicate seed"):
                loadSeedFile(path)

    def testTransportEventClassificationAndSummary(self) -> None:
        events = [
            {"phase": "baseline", "kind": classifyMessage([0x90, 60, 100])},
            {"phase": "baseline", "kind": classifyMessage([0x90, 60, 0])},
            {"phase": "afterStop", "kind": classifyMessage([0x80, 60, 0])},
            {"phase": "afterStop", "kind": classifyMessage([0xB0, 123, 0])},
        ]
        self.assertEqual(summarize(events, ["baseline", "afterStop"]), {
            "baseline": {"noteOn": 1, "noteOff": 1},
            "afterStop": {"noteOff": 1, "allNotesOff": 1},
        })

    def testContrastTrialSummary(self) -> None:
        events = [
            {"kind": "noteOn", "message": [0x91, 60, 90], "trialElapsedMs": 100.0},
            {"kind": "noteOff", "message": [0x81, 60, 0], "trialElapsedMs": 200.0},
            {"kind": "noteOn", "message": [0x91, 64, 110], "trialElapsedMs": 1_600.0},
        ]
        summary = summarizeTrial(events, 2.0)
        self.assertEqual(summary["noteOnCount"], 2)
        self.assertEqual(summary["pitchClasses"], {0: 1, 4: 1})
        self.assertEqual(summary["channels"], {1: 2})
        self.assertTrue(summary["activeInFinalQuarter"])


if __name__ == "__main__":
    unittest.main()
