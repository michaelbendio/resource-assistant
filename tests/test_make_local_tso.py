#!/usr/bin/env python3

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
HELPER = ROOT / "make-local-tso"


class MakeLocalTsoTests(unittest.TestCase):
    def run_helper(self, *arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(HELPER), *arguments],
            cwd=ROOT,
            check=check,
            capture_output=True,
            text=True,
        )

    def test_generates_existing_and_future_offices_without_a_registry(self) -> None:
        offices = {
            "provo": "Provo TSO Resources",
            "albuquerque": "Albuquerque TSO Resources",
            "mesa": "Mesa TSO Resources",
        }
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            source = temp / "template.html"
            source.write_text(
                '<html><head><meta name="tso-storage-id" content="">'
                '<title>&lt;New&gt; TSO Resources</title></head><body></body></html>',
                encoding="utf-8",
            )

            for office, title in offices.items():
                with self.subTest(office=office):
                    output = temp / f"{office}.html"
                    self.run_helper(
                        office,
                        "--source",
                        str(source),
                        "--output",
                        str(output),
                    )
                    document = output.read_text(encoding="utf-8")
                    self.assertIn(f'<meta name="tso-storage-id" content="{office}">', document)
                    self.assertIn(f"<title>{title}</title>", document)

    def test_supports_a_custom_display_name_and_output_filename(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            source = temp / "template.html"
            output = temp / "slc.html"
            source.write_text(
                '<meta name="tso-storage-id" content=""><title>&lt;New&gt; TSO Resources</title>',
                encoding="utf-8",
            )

            self.run_helper(
                "salt-lake",
                "--source",
                str(source),
                "--output",
                str(output),
            )

            document = output.read_text(encoding="utf-8")
            self.assertIn('content="salt-lake"', document)
            self.assertIn("<title>Salt Lake TSO Resources</title>", document)

    def test_refuses_to_overwrite_the_template(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "template.html"
            original = '<meta name="tso-storage-id" content=""><title>Template</title>'
            source.write_text(original, encoding="utf-8")

            result = self.run_helper(
                "mesa",
                "--source",
                str(source),
                "--output",
                str(source),
                check=False,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Refusing to overwrite", result.stderr)
            self.assertEqual(source.read_text(encoding="utf-8"), original)


if __name__ == "__main__":
    unittest.main()
