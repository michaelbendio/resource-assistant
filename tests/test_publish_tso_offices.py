#!/usr/bin/env python3

from __future__ import annotations

import importlib.machinery
import importlib.util
import html
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "publish-tso-offices"
LOADER = importlib.machinery.SourceFileLoader("publish_tso_offices", str(SCRIPT))
SPEC = importlib.util.spec_from_loader(LOADER.name, LOADER)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load publish-tso-offices")
publish_tso_offices = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(publish_tso_offices)


TEST_COMMIT = "a" * 7


def office_html(storage_id: str, title: str, version: str = "2.3.1", build: int = 211) -> str:
    payload = json.dumps({"version": version, "build": build, "changes": []})
    office_name = title.removesuffix(" TSO Resources")
    sharepoint_url = publish_tso_offices.expected_sharepoint_url(storage_id, office_name)
    return (
        f'<meta name="tso-storage-id" content="{storage_id}">'
        f'<meta name="tso-office-name" content="{office_name}">'
        f'<meta name="tso-sharepoint-package-url" content="{html.escape(sharepoint_url, quote=True)}">'
        f'<meta name="tso-commit" content="{TEST_COMMIT}">'
        f"<title>{title}</title>"
        f'<script id="app-release-data" type="application/json">{payload}</script>'
    )


class PublishTsoOfficesTests(unittest.TestCase):
    def test_publishes_and_verifies_both_active_office_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            root = temp / "repo"
            destination = temp / "iCloud Documents" / "TSO"
            (root / "src").mkdir(parents=True)
            destination.parent.mkdir()
            (root / "src/release.json").write_text(
                json.dumps({"version": "2.3.1", "build": 211}), encoding="utf-8"
            )
            (root / "provo.html").write_text(
                office_html("provo", "Provo TSO Resources"), encoding="utf-8"
            )
            (root / "albuquerque.html").write_text(
                office_html("albuquerque", "Albuquerque TSO Resources"), encoding="utf-8"
            )

            with (
                patch.object(publish_tso_offices, "ROOT", root),
                patch.object(publish_tso_offices, "current_commit", return_value=TEST_COMMIT),
            ):
                published = publish_tso_offices.publish_office_files(destination)

            self.assertEqual(
                [path.name for path in published],
                ["provo.html", "albuquerque.html"],
            )
            for filename in publish_tso_offices.ACTIVE_OFFICES:
                self.assertEqual(
                    (root / filename).read_bytes(),
                    (destination / filename).read_bytes(),
                )

    def test_refuses_to_publish_when_icloud_documents_is_unavailable(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            destination = Path(temp_dir) / "missing Documents" / "TSO"
            with self.assertRaisesRegex(
                publish_tso_offices.PublicationError,
                "iCloud Drive Documents is unavailable",
            ):
                publish_tso_offices.publish_office_files(destination)

    def test_preflight_rejects_wrong_office_identity_before_copying(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            root = temp / "repo"
            destination = temp / "iCloud Documents" / "TSO"
            (root / "src").mkdir(parents=True)
            destination.parent.mkdir()
            (root / "src/release.json").write_text(
                json.dumps({"version": "2.3.1", "build": 211}), encoding="utf-8"
            )
            (root / "provo.html").write_text(
                office_html("wrong", "Provo TSO Resources"), encoding="utf-8"
            )
            (root / "albuquerque.html").write_text(
                office_html("albuquerque", "Albuquerque TSO Resources"), encoding="utf-8"
            )

            with (
                patch.object(publish_tso_offices, "ROOT", root),
                patch.object(publish_tso_offices, "current_commit", return_value=TEST_COMMIT),
                self.assertRaisesRegex(publish_tso_offices.PublicationError, "expected"),
            ):
                publish_tso_offices.publish_office_files(destination)

            self.assertFalse(destination.exists())

    def test_preflight_rejects_wrong_build_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            root = temp / "repo"
            destination = temp / "iCloud Documents" / "TSO"
            (root / "src").mkdir(parents=True)
            destination.parent.mkdir()
            (root / "src/release.json").write_text(
                json.dumps({"version": "2.3.1", "build": 211}), encoding="utf-8"
            )
            (root / "provo.html").write_text(
                office_html("provo", "Provo TSO Resources", build=210), encoding="utf-8"
            )
            (root / "albuquerque.html").write_text(
                office_html("albuquerque", "Albuquerque TSO Resources"), encoding="utf-8"
            )

            with (
                patch.object(publish_tso_offices, "ROOT", root),
                patch.object(publish_tso_offices, "current_commit", return_value=TEST_COMMIT),
                self.assertRaisesRegex(publish_tso_offices.PublicationError, "build provenance"),
            ):
                publish_tso_offices.publish_office_files(destination)

            self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()
