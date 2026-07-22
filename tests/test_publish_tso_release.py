#!/usr/bin/env python3

from __future__ import annotations

import importlib.machinery
import importlib.util
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "publish-tso-release"
LOADER = importlib.machinery.SourceFileLoader("publish_tso_release", str(SCRIPT))
SPEC = importlib.util.spec_from_loader(LOADER.name, LOADER)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load publish-tso-release")
publish_tso_release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(publish_tso_release)


def sample_html(version: str, storage_id: str, title: str) -> str:
    payload = json.dumps({"version": version, "changes": []})
    return (
        f'<meta name="tso-storage-id" content="{storage_id}">'
        f"<title>{title}</title>"
        f'<script id="app-release-data" type="application/json">{payload}</script>'
    )


class PublishTsoReleaseTests(unittest.TestCase):
    def test_verify_html_accepts_expected_release_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "provo.html"
            path.write_text(
                sample_html("2.2.3", "provo", "Provo TSO Resources"),
                encoding="utf-8",
            )
            publish_tso_release.verify_html(
                path,
                version="2.2.3",
                storage_id="provo",
                title="Provo TSO Resources",
            )

    def test_verify_html_rejects_wrong_version(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "new.html"
            path.write_text(
                sample_html("2.2.2", "", "&lt;New&gt; TSO Resources"),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(
                publish_tso_release.ReleaseError,
                "does not contain app version 2.2.3",
            ):
                publish_tso_release.verify_html(
                    path,
                    version="2.2.3",
                    storage_id="",
                    title="&lt;New&gt; TSO Resources",
                )

    def test_publish_requires_existing_destination(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            missing = Path(temp_dir) / "missing"
            with self.assertRaisesRegex(
                publish_tso_release.ReleaseError,
                "iCloud TSO directory is unavailable",
            ):
                publish_tso_release.publish(missing)

    def test_publish_and_verify_only_office_files(self) -> None:
        previous_root = publish_tso_release.ROOT
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir) / "repo"
            destination = Path(temp_dir) / "iCloud" / "TSO"
            root.mkdir()
            destination.mkdir(parents=True)
            try:
                publish_tso_release.ROOT = root
                (root / "new.html").write_text(
                    sample_html("2.2.3", "", "&lt;New&gt; TSO Resources"),
                    encoding="utf-8",
                )
                for filename, expected in publish_tso_release.PUBLISHED_FILES.items():
                    (root / filename).write_text(
                        sample_html("2.2.3", expected["storage_id"], expected["title"]),
                        encoding="utf-8",
                    )
                with redirect_stdout(io.StringIO()):
                    publish_tso_release.publish(destination)
                    publish_tso_release.verify_published_files(destination, "2.2.3")
                    self.assertFalse((destination / "new.html").exists())
                    (destination / "provo.html").write_text("changed", encoding="utf-8")
                    with self.assertRaisesRegex(
                        publish_tso_release.ReleaseError,
                        "Published file differs",
                    ):
                        publish_tso_release.verify_published_files(destination, "2.2.3")
            finally:
                publish_tso_release.ROOT = previous_root


if __name__ == "__main__":
    unittest.main()
