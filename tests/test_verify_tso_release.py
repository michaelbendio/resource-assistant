#!/usr/bin/env python3

from __future__ import annotations

import importlib.machinery
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "verify-tso-release"
LOADER = importlib.machinery.SourceFileLoader("verify_tso_release", str(SCRIPT))
SPEC = importlib.util.spec_from_loader(LOADER.name, LOADER)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load verify-tso-release")
verify_tso_release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verify_tso_release)


def sample_release() -> dict[str, object]:
    return {
        "version": "2.3.4",
        "date": "2026-08-06",
        "message": "Verify one application release",
        "appChanges": [
            {
                "date": "2026-08-06",
                "version": "2.3.4",
                "message": "Verify one application release",
            }
        ],
    }


def sample_html(release: dict[str, object]) -> str:
    payload = verify_tso_release.expected_release_payload(release)
    return (
        '<meta name="tso-storage-id" content="">'
        '<meta name="tso-office-name" content="">'
        '<meta name="tso-sharepoint-package-url" content="">'
        "<title>&lt;New&gt; TSO Resources</title>"
        f'<script id="app-release-data" type="application/json">{json.dumps(payload)}</script>'
    )


class VerifyTsoReleaseTests(unittest.TestCase):
    def test_build_and_test_runs_every_required_stage_in_order(self) -> None:
        with patch.object(verify_tso_release, "run") as run:
            verify_tso_release.build_and_test()

        self.assertEqual(
            [call.args[0] for call in run.call_args_list],
            [
                [sys.executable, "build-tso-resources"],
                [sys.executable, "build-tso-resources", "--with-tests"],
                [
                    sys.executable,
                    "-m",
                    "unittest",
                    "discover",
                    "-s",
                    "tests",
                    "-p",
                    "test_*.py",
                ],
                [sys.executable, "run-browser-self-tests"],
                [sys.executable, "build-tso-resources", "--check"],
                [sys.executable, "build-tso-resources", "--with-tests", "--check"],
            ],
        )

    def test_load_release_validates_and_normalizes_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "release.json"
            path.write_text(json.dumps(sample_release()), encoding="utf-8")
            self.assertEqual(verify_tso_release.load_release(path), sample_release())

    def test_load_release_rejects_malformed_change_metadata(self) -> None:
        release = sample_release()
        release["appChanges"][0]["date"] = "August 6"
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "release.json"
            path.write_text(json.dumps(release), encoding="utf-8")
            with self.assertRaisesRegex(verify_tso_release.ReleaseError, "YYYY-MM-DD"):
                verify_tso_release.load_release(path)

    def test_verify_new_html_accepts_exact_starter_release(self) -> None:
        release = sample_release()
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "new.html"
            path.write_text(sample_html(release), encoding="utf-8")
            verify_tso_release.verify_new_html(path, release)

    def test_expected_payload_keeps_rows_for_latest_five_versions(self) -> None:
        release = sample_release()
        release["appChanges"] = [
            {"date": "2026-08-06", "version": "2.3.4", "message": "Second current change"},
            {"date": "2026-08-06", "version": "2.3.4", "message": "First current change"},
            {"date": "2026-08-05", "version": "2.3.3", "message": "Version 2.3.3"},
            {"date": "2026-08-04", "version": "2.3.2", "message": "Version 2.3.2"},
            {"date": "2026-08-03", "version": "2.3.1", "message": "Version 2.3.1"},
            {"date": "2026-08-02", "version": "2.3.0", "message": "Version 2.3.0"},
            {"date": "2026-08-01", "version": "2.2.9", "message": "Excluded sixth version"},
        ]

        self.assertEqual(
            verify_tso_release.expected_release_payload(release)["changes"],
            release["appChanges"][:6],
        )

    def test_verify_new_html_rejects_stale_change_log(self) -> None:
        release = sample_release()
        stale_release = sample_release()
        stale_release["appChanges"] = []
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "new.html"
            path.write_text(sample_html(stale_release), encoding="utf-8")
            with self.assertRaisesRegex(verify_tso_release.ReleaseError, "does not exactly match"):
                verify_tso_release.verify_new_html(path, release)

    def test_verify_new_html_rejects_office_identity(self) -> None:
        release = sample_release()
        office_html = sample_html(release).replace(
            '<meta name="tso-storage-id" content="">',
            '<meta name="tso-storage-id" content="mesa">',
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "new.html"
            path.write_text(office_html, encoding="utf-8")
            with self.assertRaisesRegex(verify_tso_release.ReleaseError, "starter storage ID"):
                verify_tso_release.verify_new_html(path, release)

    def test_pushed_state_requires_clean_matching_upstream_and_subject(self) -> None:
        def fake_capture(command: list[str]) -> str:
            if command[:2] == ["git", "status"]:
                return ""
            if command == ["git", "rev-parse", "HEAD"]:
                return "abc123"
            if command == ["git", "rev-parse", "@{upstream}"]:
                return "abc123"
            if command == ["git", "log", "-1", "--format=%s"]:
                return "Verify one application release"
            raise AssertionError(f"Unexpected command: {command}")

        with patch.object(verify_tso_release, "capture", side_effect=fake_capture):
            verify_tso_release.verify_git_release_state("Verify one application release")

    def test_pushed_state_rejects_commit_subject_mismatch(self) -> None:
        outputs = iter(["", "abc123", "abc123", "Different subject"])
        with (
            patch.object(verify_tso_release, "capture", side_effect=lambda _command: next(outputs)),
            self.assertRaisesRegex(verify_tso_release.ReleaseError, "commit subject"),
        ):
            verify_tso_release.verify_git_release_state("Expected subject")

    def test_pushed_state_reports_missing_upstream(self) -> None:
        outputs: list[object] = ["", "abc123", subprocess.CalledProcessError(128, ["git"])]

        def fake_capture(_command: list[str]) -> str:
            value = outputs.pop(0)
            if isinstance(value, BaseException):
                raise value
            return value

        with (
            patch.object(verify_tso_release, "capture", side_effect=fake_capture),
            self.assertRaisesRegex(verify_tso_release.ReleaseError, "upstream"),
        ):
            verify_tso_release.verify_git_release_state("Expected subject")


if __name__ == "__main__":
    unittest.main()
