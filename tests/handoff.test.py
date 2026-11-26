"""Offline regressions for audit evidence, profile-limited scope, and manual reviews."""
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "skills/eagle-eye/scripts"))
spec = importlib.util.spec_from_file_location("handoff", ROOT / "skills/eagle-eye/scripts/render-handoff.py")
handoff = importlib.util.module_from_spec(spec)
spec.loader.exec_module(handoff)


class HandoffTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.output = self.directory / "handoff.html"

    def stage(self, name, delta):
        directory = self.directory / name
        directory.mkdir()
        src = {"width": 80, "height": 50, "scale": 1}
        plan = {"profiles": {"wide": src, "narrow": src}, "views": {"a": {}, "b": {}, "c": {}},
                "checks": {"edge": {"point": ["box", "left"], "label": "Rail", "tolerance": .25}},
                "pairs": [{"from": "a", "to": "b", "checks": ["edge"], "profiles": ["wide"]},
                          {"from": "a", "to": "c", "checks": ["edge"], "profiles": ["narrow"]}]}
        rows, captures = [], {}
        for p, dest in [("wide", "b"), ("narrow", "c")]:
            captures[p] = {}
            for view, x in [("a", 22), (dest, 22 + delta)]:
                file = f"{p}-{view}.png"
                Image.new("RGB", (80, 50), "white").save(directory / file)
                captures[p][view] = {"file": file, "arrival": "Direct entry", "anchors": {
                    "box": {"box": {"left": x, "top": 8, "right": 60, "bottom": 38}}}}
            rows.append({"profile": p, "from": "a", "to": dest, "check": "edge", "a": {
                "value": 22, "positions": [22]}, "b": {"value": 22 + delta, "positions": [22 + delta]},
                         "expected": 0, "tolerance": .25, "delta": delta, "status": "drift" if delta else "aligned"})
        (directory / "report.json").write_text(json.dumps(
            {"version": 1, "plan": plan, "captures": captures, "rows": rows, "browser": "Test"}))
        return {"id": name, "label": name}

    def test_measured_reports_without_answer_key(self):
        first = self.stage("before", 2)
        last = self.stage("after", 0)
        brief = {"title": "Review", "stages": [first, last]}
        view = handoff.render(brief, self.directory, self.output)
        self.assertIn("Verified repair", view)
        self.assertIn("data:image/png", view)
        self.assertIn("2 / 2", view)
        self.assertNotIn("Missing captures</h3>", view)
        self.assertNotIn("Layout detection score", view)
        (self.directory / "after/wide-b.png").unlink()
        view = handoff.render(brief, self.directory, self.output)
        self.assertIn("Evidence missing", view)
        self.assertIn("1 / 2", view)
        self.assertIn("wide / b", view)
        initial = handoff.render({"title": "Open", "stages": [first]}, self.directory, self.output)
        self.assertIn('class="pill open">Open', initial)

    def test_changed_specs_leave_retest_unverified(self):
        first = self.stage("before", 2)
        last = self.stage("after", 0)
        file = self.directory / "after/report.json"
        report = handoff.read(file)
        report["plan"]["profiles"]["wide"]["theme"] = "dark"
        report["rows"] = [report["rows"][0]]
        file.write_text(json.dumps(report))
        view = handoff.render({"title": "Review", "stages": [first, last]}, self.directory, self.output)
        self.assertIn("Retest changed", view)
        self.assertIn('class="pill warn">Unverified', view)
        self.assertNotIn("Verified repair", view)

    def test_manual_verification_needs_before_and_after(self):
        Image.new("RGB", (20, 20)).save(self.directory / "before.png")
        brief = {"mode": "manual", "title": "Review", "findings": [
            {"title": "<Caption>", "observation": "Real observation", "status": "verified", "evidence": [
                {"path": "before.png", "role": "before", "label": "Before"},
                {"path": "after.png", "role": "after", "label": "After"}]}]}
        view = handoff.render(brief, self.directory, self.output)
        self.assertIn('class="pill warn">Unverified', view)
        self.assertIn("&lt;Caption&gt;", view)
        Image.new("RGB", (20, 20)).save(self.directory / "after.png")
        self.assertIn('class="pill good">Verified repair', handoff.render(brief, self.directory, self.output))


if __name__ == "__main__":
    unittest.main()
