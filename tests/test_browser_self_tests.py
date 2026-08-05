#!/usr/bin/env python3

from __future__ import annotations

import importlib.machinery
import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


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
        <div id="selfTestResults" data-self-tests-complete="true" data-self-test-count="2">
          <div>✔ PASS first test</div>
          <div>✖ FAIL second test: expected failure</div>
        </div>
        """
        self.assertEqual(
            run_browser_self_tests.parse_self_test_rows(document),
            ["✔ PASS first test", "✖ FAIL second test: expected failure"],
        )

    def test_requires_the_complete_result_marker_and_matching_count(self) -> None:
        complete_document = """
        <div id="selfTestResults" data-self-tests-complete="true" data-self-test-count="1">
          <div>✔ PASS finished test</div>
        </div>
        """
        rows, complete = run_browser_self_tests.parse_self_test_results(complete_document)
        self.assertEqual(rows, ["✔ PASS finished test"])
        self.assertTrue(complete)

        partial_document = complete_document.replace('data-self-test-count="1"', 'data-self-test-count="2"')
        _rows, complete = run_browser_self_tests.parse_self_test_results(partial_document)
        self.assertFalse(complete)

    def test_accepts_complete_results_when_chrome_lingers(self) -> None:
        document = b"""
        <div id="selfTestResults" data-self-tests-complete="true" data-self-test-count="1">
          <div>\xe2\x9c\x94 PASS finished test</div>
        </div>
        """
        timeout = subprocess.TimeoutExpired(
            cmd=["chrome"],
            timeout=60,
            output=document,
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            debug_html = Path(temp_dir) / "debug.html"
            debug_html.write_text("debug", encoding="utf-8")
            with (
                patch.object(run_browser_self_tests, "DEBUG_HTML", debug_html),
                patch.object(run_browser_self_tests.subprocess, "run", side_effect=timeout),
            ):
                rows = run_browser_self_tests.run_browser_self_tests(Path("chrome"), 60)
        self.assertEqual(rows, ["\u2714 PASS finished test"])


if __name__ == "__main__":
    unittest.main()
