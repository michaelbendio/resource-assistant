# TSO Resources

Single-file resource application for Transitional Services offices. The checked-in
`new.html` deliverable is generated from modular sources under `src/`; do not edit
the generated file directly.

## Build

Create the production deliverable without browser self-tests:

```sh
python3 build-tso-resources
```

Create the separate debug deliverable with all browser self-tests:

```sh
python3 build-tso-resources --with-tests
```

The debug output is written to `build/tso-resources-debug.html`. Open it and press
`Ctrl+Shift+T` to run the browser tests. Check generated files without rewriting:

```sh
python3 build-tso-resources --check
python3 build-tso-resources --with-tests --check
```

The ordered application sources are listed in `build-tso-resources`. The build
inlines the CSS, seed JSON, JSZip, and application JavaScript so the result remains
a portable single HTML file.

## Publish a production release

After the approved release commit has been pushed, publish and verify all active
production files with one command:

```sh
python3 publish-tso-release
```

The command builds and tests the app, generates the Provo and Albuquerque files,
copies `new.html`, `provo.html`, and `albuquerque.html` to
`iCloud Drive/Documents/TSO`, and verifies the copied bytes, version, storage IDs,
and titles. It exits with an error if the release commit is not pushed, iCloud is
unavailable, or any verification fails.

## Make a local TSO Resources file

`new.html` is the starter application. Make a local TSO copy from it, for example:

```sh
python3 make-local-tso albuquerque
```

The helper first rebuilds `new.html`, then creates `albuquerque.html`, sets the
local storage id to `albuquerque`, and sets the page title to
`Albuquerque TSO Resources`. It refuses to overwrite the master template. On a
Mac with iCloud Drive enabled, it also copies the finished file to
`iCloud Drive/Documents/TSO` so it appears in Files on synced iPhones and iPads.
Use `--no-icloud-copy` to skip that copy or `--icloud-dir PATH` to select another
synced directory.

Click the TSO Resources title in an office-specific file to see the app's Git
selected commit dates and messages from the last 14 days alongside the latest
resource package summary. Exported resource packages include the same curated
app change log.

## Local admin quick start

Open the local `.html` file directly in a browser. The file starts with the standard categories and no resources.

1. Press `Ctrl+Alt+A` to show the `Admin` button in the blue bar.
2. Click `Admin`.
3. If this is a fresh template file, click `Change TSO Name`, enter the local TSO name, and save it.
4. Click `Help` in Admin mode for the admin reference and printable first-time admin training guide.

Before editing live resources, load the latest resource package:

1. Go to `Categories`.
2. Click `Merge Resources`.
3. Choose the latest resource package ZIP file.
4. Wait for the merge to finish before making edits.

After a batch of edits, share the updated resources:

1. Click `Show change log` and review the listed changes.
2. Click `Save Resource Package`.
3. Save the exported resource package ZIP file.
4. Share that ZIP file through the normal distribution process.

Admin edits are saved in the browser first. They are not shared with anyone else until a new resource package is exported.

## Convert a resource package between JSON and ZIP

Use `convert-resource-package` to change only the package container. A JSON input
becomes a ZIP containing `tso-resources.json`; a ZIP input extracts that file as
JSON. The input data is not merged with other resources or otherwise changed.

```sh
python3 convert-resource-package alice-resources.json
python3 convert-resource-package albuquerque-resource-package.zip
```

By default, the output uses the input filename with the other extension. Use
`--output PATH` to choose another name or `--force` to replace an existing output.

## Church-hosted direction

See [`docs/church-hosting.md`](docs/church-hosting.md) for the staged path from the
current local application to centrally hosted, Microsoft-authenticated TSO Resources.
