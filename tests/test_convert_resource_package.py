#!/usr/bin/env python3

from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
HELPER = ROOT / "convert-resource-package"


class ConvertResourcePackageTests(unittest.TestCase):
    def sample_package_bytes(self) -> bytes:
        return json.dumps(
            {"categories": [{"id": "food", "label": "Food"}], "resources": []},
            indent=2,
        ).encode("utf-8")

    def run_helper(self, *arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["python3", str(HELPER), *arguments],
            cwd=ROOT,
            check=check,
            capture_output=True,
            text=True,
        )

    def test_json_to_zip_uses_expected_internal_filename(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            source = temp / "alice-package.json"
            source_bytes = self.sample_package_bytes()
            source.write_bytes(source_bytes)

            self.run_helper(str(source))

            output = temp / "alice-package.zip"
            with zipfile.ZipFile(output) as package_zip:
                self.assertEqual(package_zip.namelist(), ["tso-resources.json"])
                self.assertEqual(package_zip.read("tso-resources.json"), source_bytes)

    def test_zip_to_json_preserves_json_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            source = temp / "bob-package.zip"
            source_bytes = self.sample_package_bytes()
            with zipfile.ZipFile(source, "w", compression=zipfile.ZIP_DEFLATED) as package_zip:
                package_zip.writestr("tso-resources.json", source_bytes)
                package_zip.writestr("pdfs/example.pdf", b"example")

            self.run_helper(str(source))

            self.assertEqual((temp / "bob-package.json").read_bytes(), source_bytes)

    def test_rejects_zip_without_resource_json(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            source = temp / "not-a-package.zip"
            with zipfile.ZipFile(source, "w") as package_zip:
                package_zip.writestr("other.json", "{}")

            result = self.run_helper(str(source), check=False)

            self.assertEqual(result.returncode, 1)
            self.assertIn("does not contain tso-resources.json", result.stderr)
            self.assertFalse((temp / "not-a-package.json").exists())

    def test_refuses_to_overwrite_without_force(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            source = temp / "package.json"
            output = temp / "package.zip"
            source.write_bytes(self.sample_package_bytes())
            output.write_bytes(b"keep")

            result = self.run_helper(str(source), check=False)

            self.assertEqual(result.returncode, 2)
            self.assertEqual(output.read_bytes(), b"keep")

    def test_failed_forced_conversion_preserves_existing_output(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            source = temp / "package.json"
            output = temp / "package.zip"
            source.write_text("not JSON", encoding="utf-8")
            output.write_bytes(b"keep")

            result = self.run_helper(str(source), "--force", check=False)

            self.assertEqual(result.returncode, 1)
            self.assertEqual(output.read_bytes(), b"keep")


if __name__ == "__main__":
    unittest.main()
