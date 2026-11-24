"""Cover actual-size presentation, experimental changes, blinded decoding and missing evidence."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("grader", ROOT / "example/headline-audit/score-review.py")
grader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(grader)


class HeadlineHandoffTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.directory = Path(temp.name)

    def test_reading_scale_and_unverified_candidate(self):
        file = self.directory / "title.png"
        Image.new("RGB", (400, 100)).save(file)
        item = {"selector": "main h1", "text": "Type <&>", "file": file.name, "fonts": [],
                "variants": [{"id": "preview", "file": "missing.png"}]}
        data = {"profiles": {"phone": {"width": 390, "scale": 2}},
                "captures": {"phone": {"article": {"file": file.name, "headings": [item]}}}}
        report, output = self.directory / "report.json", self.directory / "show.html"
        report.write_text(json.dumps(data))
        subprocess.run([sys.executable, ROOT / "skills/eagle-eye/scripts/render-handoff.py",
                        "--headlines", report, output], capture_output=True, check=True)
        html = output.read_text()
        self.assertIn('style="width:200px"', html)
        self.assertIn("Type &lt;&amp;&gt;", html)
        self.assertIn("Image unavailable", html)
        self.assertNotIn("Reopened source retest", html)

    def test_retest_requires_same_profile_and_distinguishes_preview_from_source(self):
        file = self.directory / "heading.png"
        Image.new("RGB", (70, 30), "blue").save(file)
        item = {"selector": "h1", "text": "River", "file": file.name,
                "variants": [{"id": "kern", "file": file.name}]}
        data = {"profiles": {"wide": {"width": 800, "height": 600, "scale": 1}},
                "captures": {"wide": {"view": {"file": file.name, "headings": [item]}}}}
        report, fixed, output = [self.directory / name for name in ("report.json", "retest.json", "show.html")]
        report.write_text(json.dumps(data))
        fixed.write_text(json.dumps(data))
        cmd = [sys.executable, ROOT / "skills/eagle-eye/scripts/render-handoff.py",
               "--headlines", report, output, "--retest", fixed]
        subprocess.run(cmd, capture_output=True, check=True)
        self.assertIn("matches the candidate raster for kern", output.read_text())
        data["profiles"]["wide"]["scale"] = 2
        fixed.write_text(json.dumps(data))
        subprocess.run(cmd, capture_output=True, check=True)
        self.assertIn("different capture conditions", output.read_text())
        self.assertNotIn("matches the candidate raster", output.read_text())

    def test_frozen_decoding_tracks_direction_and_indifference(self):
        review = self.directory
        (review / "discovery.md").write_text("Eye review.")
        votes = {"items": [{"id": id_, "choice": vote} for id_, vote in
                           [("10", "A"), ("20", "A"), ("30", "no preference"), ("40", "no preference")]]}
        (review / "preferences.json").write_text(json.dumps(votes))
        frozen = {k: hashlib.sha256((review / f).read_bytes()).hexdigest()
                  for k, f in [("discovery", "discovery.md"), ("preferences", "preferences.json")]}
        decisions = {"frozen": frozen, "findings": [{"id": "F1", "status": "localized", "case": "a",
                                                     "directionCorrect": False, "reason": "Located only"}]}
        (review / "adjudication.json").write_text(json.dumps(decisions))
        trials = {"items": [dict(id=i, candidate=c, caseId=k, profile="wide", control=c is None)
                            for i, c, k in [("10", "B", "a"), ("20", "A", "b"), ("30", "B", "c"), ("40", None, "d")]]}
        oracle = {"seeds": [{"id": k} for k in "abc"], "controls": [{"id": "d"}]}
        result = grader.grade(review, oracle, trials)
        self.assertEqual(result["discovery"]["localized"], 1)
        self.assertEqual(result["discovery"]["direction"], 0)
        self.assertEqual(result["preference"], dict(active=3, repair=1, original=1, neutral=1, controls=1, controlNeutral=1))
        (review / "discovery.md").write_text("Changed after submission.")
        with self.assertRaisesRegex(ValueError, "digest mismatch"):
            grader.grade(review, oracle, trials)


if __name__ == "__main__":
    unittest.main()
