#!/usr/bin/env python3

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
HELPER = ROOT / "make-autocurator"


class MakeAutoCuratorTests(unittest.TestCase):
    def run_helper(self, *arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(HELPER), *arguments],
            cwd=ROOT,
            check=check,
            capture_output=True,
            text=True,
        )

    def test_builds_regular_html_with_one_populated_category(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            source = temp / "template.html"
            seed = temp / "seed.json"
            candidates = temp / "mesa-candidates.zip"
            output = temp / "autoMesa.html"
            source.write_text(
                '<html><head><meta name="tso-storage-id" content="">'
                '<meta name="tso-office-name" content="">'
                '<meta name="tso-sharepoint-package-url" content="">'
                '<meta name="tso-commit" content="">'
                '<meta name="autocurator-location-name" content="">'
                '<meta name="autocurator-category-id" content="">'
                '<meta name="autocurator-category-label" content="">'
                '<meta name="autocurator-candidate-package-sha256" content="">'
                '<title>Template</title></head><body>'
                '<script id="seed-data" type="application/json">{}</script>'
                '</body></html>',
                encoding="utf-8",
            )
            seed.write_text(json.dumps({
                "resourcePackageSchemaVersion": 3,
                "packageVersion": 1,
                "categories": [
                    {"id": "employment", "label": "Employment", "active": True},
                    {"id": "food", "label": "Food", "active": True},
                ],
                "forGroups": ["Veterans", "Families with children"],
                "resources": [
                    {
                        "id": "work",
                        "name": "Work Help",
                        "categories": ["employment", "food"],
                        "categoryFilters": {"employment": ["Résumé assistance"], "food": ["Pantry"]},
                        "forGroups": ["Veterans"],
                    },
                    {"id": "pantry", "name": "Pantry", "categories": ["food"]},
                ],
                "categoryMigrations": [],
                "changes": [{"id": "old"}],
                "deletionRequests": [{"id": "old"}],
                "deletions": [{"id": "old"}],
            }), encoding="utf-8")
            with zipfile.ZipFile(candidates, "w") as archive:
                archive.writestr("scout-candidates.json", json.dumps({
                    "candidatePackageSchemaVersion": 1,
                    "location": {"name": "Mesa"},
                    "categories": [
                        {"id": "employment", "label": "Employment", "types": ["Résumé assistance"]},
                        {"id": "food", "label": "Food", "types": ["Pantry"]},
                    ],
                    "forGroups": ["Veterans", "Families with children"],
                    "categoryManifest": [{
                        "id": "employment",
                        "label": "Employment",
                        "candidateCount": 54,
                        "researchStatus": "completed",
                    }],
                }))

            self.run_helper(
                str(candidates),
                "--category", "employment",
                "--seed", str(seed),
                "--source", str(source),
                "--output", str(output),
            )

            document = output.read_text(encoding="utf-8")
            self.assertIn('<meta name="tso-storage-id" content="autocurator-mesa">', document)
            self.assertIn('<meta name="autocurator-location-name" content="Mesa">', document)
            self.assertIn('<meta name="autocurator-category-id" content="employment">', document)
            self.assertIn('<meta name="tso-office-name" content="AutoMesa">', document)
            self.assertIn('<title>AutoMesa TSO Resources</title>', document)
            self.assertRegex(
                document,
                r'<meta name="autocurator-candidate-package-sha256" content="[0-9a-f]{64}">',
            )
            embedded = document.split(
                '<script id="seed-data" type="application/json">', 1
            )[1].split('</script>', 1)[0]
            auto_seed = json.loads(embedded)
            self.assertEqual(
                [item["id"] for item in auto_seed["categories"]],
                ["employment", "food"],
            )
            self.assertEqual(auto_seed["categories"][0]["filters"], ["Résumé assistance"])
            self.assertEqual([item["id"] for item in auto_seed["resources"]], ["work"])
            self.assertEqual(auto_seed["resources"][0]["categories"], ["employment"])
            self.assertEqual(
                auto_seed["resources"][0]["categoryFilters"],
                {"employment": ["Résumé assistance"]},
            )
            self.assertEqual(auto_seed["forGroups"], ["Veterans", "Families with children"])
            self.assertEqual(auto_seed["changes"], [])
            self.assertEqual(auto_seed["deletionRequests"], [])
            self.assertEqual(auto_seed["deletions"], [])

    def test_rejects_a_category_with_no_resources(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            source = temp / "template.html"
            source.write_text("unused", encoding="utf-8")
            seed = temp / "seed.json"
            candidates = temp / "mesa-candidates.zip"
            seed.write_text(json.dumps({
                "categories": [{"id": "employment", "label": "Employment"}],
                "resources": [],
            }), encoding="utf-8")
            with zipfile.ZipFile(candidates, "w") as archive:
                archive.writestr("scout-candidates.json", json.dumps({
                    "candidatePackageSchemaVersion": 1,
                    "location": {"name": "Mesa"},
                    "categories": [{"id": "employment", "label": "Employment", "types": []}],
                    "categoryManifest": [{
                        "id": "employment",
                        "label": "Employment",
                        "candidateCount": 54,
                        "researchStatus": "completed",
                    }],
                }))
            result = self.run_helper(
                str(candidates),
                "--category", "employment",
                "--seed", str(seed),
                "--source", str(source),
                check=False,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("no resources for 'Employment'", result.stderr)

    def test_rejects_an_unfinished_candidate_category(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            candidates = temp / "newark-candidates.zip"
            seed = temp / "seed.json"
            with zipfile.ZipFile(candidates, "w") as archive:
                archive.writestr("scout-candidates.json", json.dumps({
                    "candidatePackageSchemaVersion": 1,
                    "location": {"name": "Newark"},
                    "categories": [{"id": "employment", "label": "Employment", "types": []}],
                    "categoryManifest": [{
                        "id": "employment",
                        "label": "Employment",
                        "candidateCount": 0,
                        "researchStatus": "not-researched",
                    }],
                }))
            seed.write_text(json.dumps({
                "categories": [{"id": "employment", "label": "Employment"}],
                "resources": [{"id": "work", "categories": ["employment"]}],
            }), encoding="utf-8")
            result = self.run_helper(
                str(candidates),
                "--category", "employment",
                "--seed", str(seed),
                check=False,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("research for 'Employment' is not completed", result.stderr)


if __name__ == "__main__":
    unittest.main()
