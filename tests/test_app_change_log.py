#!/usr/bin/env python3

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import runpy
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BUILD = runpy.run_path(str(ROOT / "build-tso-resources"))
merge_app_changes = BUILD["merge_app_changes"]


class AppChangeLogTests(unittest.TestCase):
    def test_includes_only_selected_commits_from_last_14_days(self) -> None:
        now = datetime(2026, 7, 13, 18, 0, tzinfo=timezone.utc)
        release = {
            "version":"2.1.3",
            "date":"2026-07-13",
            "message":"Pending release",
            "includedCommits":["selected-recent", "selected-old"],
        }
        commits = [
            {
                "hash":"selected-recent",
                "timestamp":(now - timedelta(days=5)).isoformat(),
                "message":"Selected recent commit",
            },
            {
                "hash":"not-selected",
                "timestamp":(now - timedelta(days=2)).isoformat(),
                "message":"Unselected recent commit",
            },
            {
                "hash":"selected-old",
                "timestamp":(now - timedelta(days=15)).isoformat(),
                "message":"Selected old commit",
            },
        ]

        changes = merge_app_changes(release, commits, now)

        self.assertEqual(changes, [{"date":"2026-07-08", "message":"Selected recent commit"}])

    def test_repeated_subjects_are_preserved_when_both_commits_are_selected(self) -> None:
        now = datetime(2026, 7, 13, 18, 0, tzinfo=timezone.utc)
        release = {
            "version":"2.1.3",
            "date":"2026-07-13",
            "message":"Pending release",
            "includedCommits":["first", "second"],
        }
        commits = [
            {"hash":"first", "timestamp":now.isoformat(), "message":"Repeated subject"},
            {"hash":"second", "timestamp":(now - timedelta(days=1)).isoformat(), "message":"Repeated subject"},
        ]

        changes = merge_app_changes(release, commits, now)

        self.assertEqual(sum(change["message"] == "Repeated subject" for change in changes), 2)


if __name__ == "__main__":
    unittest.main()
