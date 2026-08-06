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

    def test_keeps_every_row_for_the_latest_five_distinct_versions(self) -> None:
        app_changes = [
            {"date": "2026-08-06", "version": "2.2.14", "message": "Third 2.2.14 change"},
            {"date": "2026-08-06", "version": "2.2.14", "message": "Second 2.2.14 change"},
            {"date": "2026-08-06", "version": "2.2.13", "message": "2.2.13 change"},
            {"date": "2026-08-06", "version": "2.2.12", "message": "2.2.12 change"},
            {"date": "2026-08-05", "version": "2.2.11", "message": "2.2.11 change"},
            {"date": "2026-08-04", "version": "2.2.10", "message": "First 2.2.10 change"},
            {"date": "2026-08-04", "version": "2.2.10", "message": "Second 2.2.10 change"},
            {"date": "2026-07-31", "version": "2.2.9", "message": "Excluded sixth version"},
        ]

        self.assertEqual(
            latest_app_changes({"appChanges": app_changes}),
            app_changes[:7],
        )


if __name__ == "__main__":
    unittest.main()
