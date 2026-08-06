# Repository instructions

## Make a local TSO HTML file

When the user says something like:

> Make mesa

interpret that as a request to generate a local TSO HTML file from `new.html`.

Run:

```sh
python3 make-local-tso mesa
```

The helper rebuilds `new.html` from the modular sources before copying it. Edit
files under `src/`, `tests/`, or `vendor/`; do not edit generated `new.html`.

This creates or overwrites `mesa.html`, sets:

```html
<meta name="tso-storage-id" content="mesa">
```

and changes the page title to:

```html
<title>Mesa TSO Resources</title>
```

The helper only generates the requested office file. It does not copy to
iCloud, removable storage, or another office location. For a different output
filename, use `--output`, for example:

```sh
python3 make-local-tso mesa --output mesa-current.html
```

The JavaScript localStorage keys are derived at runtime from the
`tso-storage-id` value. Do not edit individual storage keys. Do not modify
`new.html` directly when making an office file.

## Optional office copy

Copying an office file is always explicit and separate from application release
verification and office-file generation:

```sh
python3 copy-local-tso mesa.html /path/to/destination
```

The copy helper requires a generated office file with a nonblank storage ID and
valid release metadata. It copies atomically and verifies byte parity. It has no
default office, office registry, or destination.

At Michael's TSO Windows workstation on Tuesdays and Thursdays, after an
approved release has been pushed, use the cloned repository at
`C:\Users\MichaelBendio\resource-assistant` to generate `albuquerque.html` and
`provo.html` individually. This must refresh both office files in that cloned
repository. Then copy those exact files to `E:\TSO` when that drive is
available. Treat this as two explicit office publications, not a general
release step. If `E:\TSO` is unavailable, stop with an error; do not substitute
iCloud or another location.

## Commit and version workflow

Before each commit, ask the user to approve the next patch version or provide a
different version. If the user instructs you in advance not to bump the version,
treat that as approval to keep the current version for that commit and do not ask
again or flag the exception. Before committing:

1. Update `src/release.json` with the proposed version, current date, and exact
   planned commit subject. Add a new `appChanges` row using that same exact
   commit subject. When the version is unchanged, give the new row the current
   version and retain the other rows for that version. The app groups separate
   rows beneath one version heading and includes the latest five distinct
   versions. Preserve the existing change-log history unless the user selects a
   different visible set.
2. Run `python3 verify-tso-release`. This rebuilds both outputs and runs all
   Python and browser tests.
3. Unless the user already approved a version or instructed you not to bump it,
   ask: `Commit as version X.Y.Z? Reply y or provide a version number.`

Do not commit or push until the user replies `y`, supplies the version to use, or
has already instructed you to retain the current version.

## Mandatory application release verification

Application verification is separate from publishing any office file. The
general verification command must never contain office names or require iCloud:

```sh
python3 verify-tso-release
```

After an approved release commit has been pushed, do not report the application
release as complete until this command succeeds:

```sh
python3 verify-tso-release --require-pushed
```

The pushed-state check requires a clean worktree, a pushed upstream commit, and
a commit subject exactly matching `src/release.json`. Office generation and
copying happen only when requested for that office and are not prerequisites for
verifying the application release.

## Resource package migrations

Resource packages must follow the pipeline documented in
`docs/resource-package-migrations.md`:

```text
read → migrate schema versions → normalize → apply tombstones → validate
```

Add compatibility behavior to a focused schema migration in
`src/js/27-package-pipeline.js`; do not add legacy transformations to canonical
normalization or make behavior depend on call order. Each new or changed
migration requires a fixture in `tests/fixtures/package-fixtures.js` and browser
regression coverage for safe-field preservation and failure behavior.

## Office-local administrative state

Office setup, download-folder handles, publishing history, and recovery points
belong only to the office HTML file currently open on that computer. Keep this
state in office-scoped browser storage; never export it in resource packages and
never introduce a central office registry. Preserve compatibility with existing
SharePoint destination keys and legacy single pre-merge snapshots.
