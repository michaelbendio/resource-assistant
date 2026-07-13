#!/usr/bin/env python3

from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
HELPER = ROOT / "make-local-tso"


class MakeLocalTsoTests(unittest.TestCase):
    def test_writes_local_file_and_icloud_copy(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            source = temp / "template.html"
            output = temp / "salt-lake.html"
            icloud_dir = temp / "iCloud Drive" / "Documents" / "TSO"
            source.write_text(
                '<html><head><meta name="tso-storage-id" content="new">'
                '<title>TSO Resources</title></head><body></body></html>',
                encoding="utf-8",
            )

            subprocess.run(
                [
                    "python3",
                    str(HELPER),
                    "salt-lake",
                    "--source",
                    str(source),
                    "--output",
                    str(output),
                    "--icloud-dir",
                    str(icloud_dir),
                ],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )

            icloud_output = icloud_dir / output.name
            self.assertTrue(output.exists())
            self.assertTrue(icloud_output.exists())
            self.assertEqual(output.read_bytes(), icloud_output.read_bytes())
            html = output.read_text(encoding="utf-8")
            self.assertIn('content="salt-lake"', html)
            self.assertIn("<title>Salt Lake TSO Resources</title>", html)

    def test_can_skip_icloud_copy(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            source = temp / "template.html"
            output = temp / "provo.html"
            icloud_dir = temp / "TSO"
            source.write_text(
                '<meta name="tso-storage-id" content="new"><title>TSO Resources</title>',
                encoding="utf-8",
            )

            subprocess.run(
                [
                    "python3",
                    str(HELPER),
                    "provo",
                    "--source",
                    str(source),
                    "--output",
                    str(output),
                    "--icloud-dir",
                    str(icloud_dir),
                    "--no-icloud-copy",
                ],
                cwd=ROOT,
                check=True,
                capture_output=True,
                text=True,
            )

            self.assertTrue(output.exists())
            self.assertFalse(icloud_dir.exists())


if __name__ == "__main__":
    unittest.main()
