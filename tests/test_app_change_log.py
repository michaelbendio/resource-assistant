#!/usr/bin/env python3

from __future__ import annotations

import runpy
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BUILD = runpy.run_path(str(ROOT / "build-tso-resources"))
latest_app_changes = BUILD["latest_app_changes"]


class AppChangeLogTests(unittest.TestCase):
    def test_returns_only_latest_five_releases(self) -> None:
        app_changes = [
            {
                "date": f"2026-07-{25 - index:02d}",
                "version": f"2.2.{8 - index}",
                "message": f"Release {index + 1}",
            }
            for index in range(6)
        ]

        self.assertEqual(
            latest_app_changes({"appChanges": app_changes}),
            app_changes[:5],
        )

    def test_preserves_release_date_version_and_message(self) -> None:
        release = {
            "appChanges": [{
                "date": "2026-07-25",
                "version": "2.2.8",
                "message": "Preserve latest resource package updates",
            }],
        }

        self.assertEqual(latest_app_changes(release), [{
            "date": "2026-07-25",
            "version": "2.2.8",
            "message": "Preserve latest resource package updates",
        }])


if __name__ == "__main__":
    unittest.main()
