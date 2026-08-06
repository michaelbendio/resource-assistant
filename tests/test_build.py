#!/usr/bin/env python3

from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


class BuildTests(unittest.TestCase):
    def test_admin_editor_sources_are_split_and_built_in_order(self) -> None:
        source_paths = [
            "src/js/100a-admin-search-and-references.js",
            "src/js/100b-admin-editor-core.js",
            "src/js/100c-admin-category-editor.js",
            "src/js/100d-admin-resource-editor.js",
            "src/js/100e-admin-for-groups-editor.js",
        ]
        self.assertFalse((ROOT / "src/js/100-admin-editors.js").exists())
        for source_path in source_paths:
            self.assertTrue((ROOT / source_path).is_file(), source_path)

        production = (ROOT / "new.html").read_text(encoding="utf-8")
        source_markers = [f"// Source: {source_path}" for source_path in source_paths]
        marker_positions = [production.find(marker) for marker in source_markers]
        self.assertTrue(all(position >= 0 for position in marker_positions))
        self.assertEqual(marker_positions, sorted(marker_positions))

    def test_generated_outputs_are_current(self) -> None:
        subprocess.run(
            [sys.executable, "build-tso-resources", "--check"],
            cwd=ROOT,
            check=True,
        )
        subprocess.run(
            [sys.executable, "build-tso-resources", "--with-tests", "--check"],
            cwd=ROOT,
            check=True,
        )

    def test_production_omits_self_tests(self) -> None:
        production = (ROOT / "new.html").read_text(encoding="utf-8")
        self.assertIn('id="app-release-data"', production)
        self.assertIn('"changes": [', production)
        self.assertNotIn("function runSelfTests", production)
        self.assertNotIn("PACKAGE_MIGRATION_FIXTURES", production)
        self.assertNotIn('id="selfTestPanel"', production)
        self.assertNotIn("isSelfTestShortcut", production)

    def test_debug_build_includes_self_tests(self) -> None:
        debug = (ROOT / "build/tso-resources-debug.html").read_text(encoding="utf-8")
        self.assertIn("function runSelfTests", debug)
        self.assertIn('id="selfTestPanel"', debug)
        self.assertIn("isSelfTestShortcut", debug)
        self.assertIn("PACKAGE_MIGRATION_FIXTURES", debug)


if __name__ == "__main__":
    unittest.main()
