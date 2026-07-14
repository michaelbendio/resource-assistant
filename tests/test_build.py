#!/usr/bin/env python3

from __future__ import annotations

import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


class BuildTests(unittest.TestCase):
    def test_generated_outputs_are_current(self) -> None:
        subprocess.run(
            ["python3", "build-tso-resources", "--check"],
            cwd=ROOT,
            check=True,
        )
        subprocess.run(
            ["python3", "build-tso-resources", "--with-tests", "--check"],
            cwd=ROOT,
            check=True,
        )

    def test_production_omits_self_tests(self) -> None:
        production = (ROOT / "new.html").read_text(encoding="utf-8")
        self.assertIn('id="app-release-data"', production)
        self.assertIn('"changes": [', production)
        self.assertNotIn("function runSelfTests", production)
        self.assertNotIn('id="selfTestPanel"', production)
        self.assertNotIn("isSelfTestShortcut", production)

    def test_debug_build_includes_self_tests(self) -> None:
        debug = (ROOT / "build/tso-resources-debug.html").read_text(encoding="utf-8")
        self.assertIn("function runSelfTests", debug)
        self.assertIn('id="selfTestPanel"', debug)
        self.assertIn("isSelfTestShortcut", debug)


if __name__ == "__main__":
    unittest.main()
