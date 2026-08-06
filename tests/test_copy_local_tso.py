#!/usr/bin/env python3

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
HELPER = ROOT / "copy-local-tso"


def office_html(storage_id: str = "mesa", title: str = "Mesa TSO Resources") -> str:
    payload = json.dumps({"version": "2.3.4", "changes": []})
    return (
        f'<meta name="tso-storage-id" content="{storage_id}">'
        f"<title>{title}</title>"
        f'<script id="app-release-data" type="application/json">{payload}</script>'
    )


class CopyLocalTsoTests(unittest.TestCase):
    def run_helper(self, *arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(HELPER), *arguments],
            cwd=ROOT,
            check=check,
            capture_output=True,
            text=True,
        )

    def test_copies_to_an_explicit_destination_and_verifies_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            source = temp / "mesa.html"
            destination_dir = temp / "flash-drive" / "TSO"
            source.write_text(office_html(), encoding="utf-8")

            result = self.run_helper(str(source), str(destination_dir))

            destination = destination_dir / source.name
            self.assertTrue(destination.is_file())
            self.assertEqual(source.read_bytes(), destination.read_bytes())
            self.assertIn("storage id 'mesa'", result.stdout)
            self.assertIn("version 2.3.4", result.stdout)

    def test_replaces_an_existing_office_copy(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            source = temp / "provo.html"
            destination_dir = temp / "destination"
            destination_dir.mkdir()
            source.write_text(office_html("provo", "Provo TSO Resources"), encoding="utf-8")
            (destination_dir / source.name).write_text("old", encoding="utf-8")

            self.run_helper(str(source), str(destination_dir))

            self.assertEqual(source.read_bytes(), (destination_dir / source.name).read_bytes())

    def test_refuses_to_copy_the_starter_template(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            source = temp / "new.html"
            source.write_text(
                office_html("", "&lt;New&gt; TSO Resources"),
                encoding="utf-8",
            )

            result = self.run_helper(str(source), str(temp / "destination"), check=False)

            self.assertEqual(result.returncode, 1)
            self.assertIn("starter template", result.stderr)
            self.assertFalse((temp / "destination").exists())

    def test_missing_source_does_not_create_the_destination(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            result = self.run_helper(
                str(temp / "missing.html"),
                str(temp / "destination"),
                check=False,
            )

            self.assertEqual(result.returncode, 1)
            self.assertIn("Office file was not found", result.stderr)
            self.assertFalse((temp / "destination").exists())


if __name__ == "__main__":
    unittest.main()
