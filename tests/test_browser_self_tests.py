#!/usr/bin/env python3

from __future__ import annotations

import importlib.machinery
import importlib.util
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "run-browser-self-tests"
LOADER = importlib.machinery.SourceFileLoader("run_browser_self_tests", str(SCRIPT))
SPEC = importlib.util.spec_from_loader(LOADER.name, LOADER)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load run-browser-self-tests")
run_browser_self_tests = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(run_browser_self_tests)


class BrowserSelfTestRunnerTests(unittest.TestCase):
    def test_extracts_only_rendered_self_test_rows(self) -> None:
        document = """
        <script>const sourceText = "✖ FAIL source text is not a result";</script>
        <div id="selfTestResults">
          <div>✔ PASS first test</div>
          <div>✖ FAIL second test: expected failure</div>
        </div>
        """
        self.assertEqual(
            run_browser_self_tests.parse_self_test_rows(document),
            ["✔ PASS first test", "✖ FAIL second test: expected failure"],
        )


if __name__ == "__main__":
    unittest.main()
