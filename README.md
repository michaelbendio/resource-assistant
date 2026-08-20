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
`Ctrl+Shift+T` to run the browser tests, or execute them automatically in an
installed Edge, Chrome, or Chromium browser:

```sh
python3 run-browser-self-tests
```

Set `TSO_BROWSER` to a browser executable path when automatic discovery is not
appropriate. Check generated files without rewriting:

```sh
python3 build-tso-resources --check
python3 build-tso-resources --with-tests --check
```

The ordered application sources are listed in `build-tso-resources`. The build
inlines the CSS, seed JSON, JSZip, and application JavaScript so the result remains
a portable single HTML file.

## Verify an application release

Build both outputs, run every Python and browser test, and verify `new.html` and
its embedded release metadata with one platform-neutral command:

```sh
python3 verify-tso-release
```

The verifier does not know office names and does not publish anything. Before an
approved release is reported complete, push its commit and run:

```sh
python3 verify-tso-release --require-pushed
```

That additional check requires a clean worktree, confirms that `HEAD` matches
its upstream branch, and checks that the commit subject matches
`src/release.json`.

## Make a local TSO Resources file

`new.html` is the starter application. Make a local TSO copy from it, for example:

```sh
python3 make-local-tso albuquerque
```

The helper first rebuilds `new.html`, then creates `albuquerque.html`, sets the
local storage ID to `albuquerque`, and sets the page title to
`Albuquerque TSO Resources`. It also embeds the office name and SharePoint
resource-package URL so those settings travel with the office HTML file. It
refuses to overwrite the master template. The same command works for a future
office such as `mesa`; there is no central office registry.

Generation does not copy the office file anywhere. After a pushed application
release has been verified, generate all three active office files and publish them to
`iCloud Drive/Documents/TSO`:

```sh
python3 make-local-tso provo
python3 make-local-tso albuquerque
python3 make-local-tso mesa
python3 publish-tso-offices
```

The publication helper validates all three office identities and release versions,
copies `provo.html`, `albuquerque.html`, and `mesa.html` atomically, and verifies byte parity.
It does not copy `new.html`, and it fails when iCloud Drive Documents is
unavailable. For a separately requested one-off copy to another destination,
use `copy-local-tso` with an explicit source and destination.

Click the TSO Resources title in an office-specific file to see the app's Git
selected commit dates and messages from the last 14 days alongside the latest
resource package summary. Exported resource packages include the same curated
app change log.

## Local admin quick start

Open the local `.html` file directly in a browser. The file starts with the standard categories and no resources.

1. Press `Ctrl+Alt+A` to show the `Admin` button in the blue bar.
2. Click `Admin`.
3. Click `Office Setup`. Review the office name, storage ID, expected resource-package filename, and SharePoint package URL carried by the HTML file, then authorize this computer's download folder.
4. Click `Help` in Admin mode for the admin reference and printable first-time admin training guide.

Before editing live resources, load the latest resource package:

1. Go to `Categories`.
2. Click `Merge Resources`.
3. Choose the latest resource package ZIP file.
4. If the package contains items tagged for deletion, review their effects immediately. Print the proposed-deletions list if you want a paper worksheet, approve the deletions you want applied, and leave the others unchecked to keep them.
5. Wait for the merge to finish before making edits.

The app keeps the five newest pre-merge recovery points, labeled with their time,
package version, and source filename. In Admin, use `Recovery points` to select a
snapshot. Restoring discards the merge and every edit made after that snapshot,
but it does not erase the other recovery points.

After a batch of edits, share the updated resources:

1. Click `Show change log` and review the listed changes.
2. Resource missionaries click `Save Resource Package`, save the exported ZIP, and send it to the office admin.
3. The office admin merges submitted packages and reviews tagged deletions.
4. In the office-specific HTML file, the admin clicks `Publish to SharePoint`, downloads the current canonical package when prompted, and waits for `Merge complete`.
5. The admin reviews the publication summary, clicks `Upload to SharePoint`, uploads the saved canonical package, and chooses `Replace`.
6. The admin clicks `I replaced the package` to record the manual action locally. The app cannot independently verify the SharePoint upload.

The generated office HTML carries its office name, storage ID, expected package
filename, and SharePoint package URL. On first use on each computer, `Office
Setup` authorizes that computer's download folder. `Test Configuration` reports
whether setup is complete. The app validates the WSR_TSO location, expected
office package filename, and containing folder. Download-folder authorization
and local publishing history remain in office-scoped browser storage and are
never included in exported packages. TSO Resources watches the authorized folder
for the completed canonical package,
merges it with the prepared local data, reapplies approved deletion tombstones, and
saves the combined package automatically. SharePoint upload and replacement remain
manual and are authorized by the signed-in user's SharePoint permissions.

Delete actions tag resources, categories, Types, and For groups for deletion. The
tagged item remains active until an admin merges the package and approves the
deletion. Approved deletions are retained in future packages so that merging an
older package does not recreate them.

Resource package compatibility follows an explicit
`read → migrate → normalize → apply tombstones → validate` pipeline. See
[`docs/resource-package-migrations.md`](docs/resource-package-migrations.md) for
the supported schemas, legacy-field handling, safe-field preservation, and
failure rules.

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

See [`docs/church-hosting.md`](docs/church-hosting.md) for the SharePoint document-library
and guided publishing workflow.
