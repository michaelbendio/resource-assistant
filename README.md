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
`Albuquerque TSO Resources`. It refuses to overwrite the master template. The
same command works for a future office such as `mesa`; there is no central
office registry.

Generation does not copy the office file anywhere. To copy one generated file
to an explicitly selected sync folder or removable drive, run:

```sh
python3 copy-local-tso albuquerque.html /path/to/destination
```

The helper validates the office identity and release metadata, performs an
atomic copy, and verifies byte parity.

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
4. If the package contains items tagged for deletion, review their effects immediately. Print the proposed-deletions list if you want a paper worksheet, approve the deletions you want applied, and leave the others unchecked to keep them.
5. Wait for the merge to finish before making edits.

The app keeps one pre-merge restore point. In Admin, use `Return to before merge`
to discard the merge and every edit made after it.

After a batch of edits, share the updated resources:

1. Click `Show change log` and review the listed changes.
2. Resource missionaries click `Save Resource Package`, save the exported ZIP, and send it to the office admin.
3. The office admin merges submitted packages and reviews tagged deletions.
4. In the office-specific HTML file, the admin clicks `Publish to SharePoint`, downloads the current canonical package when prompted, and waits for `Merge complete`.
5. The admin clicks `Upload to SharePoint`, uploads the saved canonical package, and chooses `Replace`.

On first use on each computer, guided publishing asks the admin to paste the
address-bar URL for that office's SharePoint resource-package ZIP. The app validates
the WSR_TSO location, expected office package filename, and containing folder before
saving the destination in office-scoped browser storage. The destination is never
included in exported packages. The admin then authorizes the folder where Edge saves
downloads. TSO Resources watches that folder for the completed canonical package,
merges it with the prepared local data, reapplies approved deletion tombstones, and
saves the combined package automatically. SharePoint upload and replacement remain
manual and are authorized by the signed-in user's SharePoint permissions.

Delete actions tag resources, categories, Types, and For groups for deletion. The
tagged item remains active until an admin merges the package and approves the
deletion. Approved deletions are retained in future packages so that merging an
older package does not recreate them.

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
