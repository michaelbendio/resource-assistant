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

        self.assertEqual(changes, [
            {"date":"2026-07-13", "message":"Pending release"},
            {"date":"2026-07-08", "message":"Selected recent commit"},
        ])

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

    def test_uses_commit_local_date_for_display(self) -> None:
        release = {
            "version":"2.2.4",
            "date":"2026-07-15",
            "message":"Show latest app changes",
            "includedCommits":["evening-commit"],
        }
        commits = [{
            "hash":"evening-commit",
            "timestamp":"2026-07-15T19:30:00-06:00",
            "message":"Evening change",
        }]

        changes = merge_app_changes(
            release,
            commits,
            datetime(2026, 7, 16, 2, 0, tzinfo=timezone.utc),
        )

        self.assertEqual(changes, [
            {"date":"2026-07-15", "message":"Show latest app changes"},
            {"date":"2026-07-15", "message":"Evening change"},
        ])

    def test_selected_commit_can_use_app_specific_message(self) -> None:
        now = datetime(2026, 7, 15, 18, 0, tzinfo=timezone.utc)
        release = {
            "version":"2.2.4",
            "date":"2026-07-15",
            "message":"Show latest app changes",
            "includedCommits":["selected"],
            "appChangeMessages":{"selected":"Changed the title bar layout"},
        }
        commits = [{
            "hash":"selected",
            "timestamp":now.isoformat(),
            "message":"Refine category landing layout",
        }]

        changes = merge_app_changes(release, commits, now)

        self.assertEqual(changes, [
            {"date":"2026-07-15", "message":"Show latest app changes"},
            {"date":"2026-07-15", "message":"Changed the title bar layout"},
        ])

    def test_current_release_message_is_visible_without_its_own_commit_hash(self) -> None:
        release = {
            "version":"2.2.5",
            "date":"2026-07-21",
            "message":"Keep print buttons visible",
            "includedCommits":[],
        }

        changes = merge_app_changes(
            release,
            [],
            datetime(2026, 7, 21, 18, 0, tzinfo=timezone.utc),
        )

        self.assertEqual(changes, [{
            "date":"2026-07-21",
            "message":"Keep print buttons visible",
        }])


if __name__ == "__main__":
    unittest.main()
