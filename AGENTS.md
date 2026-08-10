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

## Stage 3: Publish active office files to iCloud

After an approved release commit has been pushed and verified, generate both
active office files:

```sh
python3 make-local-tso provo
python3 make-local-tso albuquerque
```

Then run the required Stage 3 publication:

```sh
python3 publish-tso-offices
```

The publication helper copies exactly `provo.html` and `albuquerque.html` to
`iCloud Drive/Documents/TSO`, verifies their office storage IDs, titles, app
versions, and copied bytes, and leaves `new.html` local. If iCloud Drive
Documents is unavailable, stop with an error; do not substitute another
destination. Do not report the active-office publication complete until the
command reports `OFFICE PUBLICATION COMPLETE` and confirms two files.

`copy-local-tso` remains available for an explicitly requested one-off copy to
another destination, but it does not replace the required Stage 3 publication.

## Commit and version workflow

Before each commit, ask the user to approve the next patch version or provide a
different version. If the user instructs you in advance not to bump the version,
treat that as approval to keep the current version for that commit and do not ask
again or flag the exception. Before committing:

1. Update `src/release.json` with the proposed version, current date, and exact
   planned commit subject. Add an `appChanges` row only when the commit changes
   user-visible app functionality. Do not add rows for documentation, tests,
   deployment or publication workflow, internal refactoring, or release-metadata
   corrections. When a functional change keeps the current version, give the
   new row that version and retain the other rows for it. The app groups
   separate rows beneath one version heading and includes the latest five
   distinct versions. Preserve the existing change-log history unless the user
   selects a different visible set.
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
a commit subject exactly matching `src/release.json`. Application verification
remains office-neutral, but the complete active-office release workflow also
requires generating Provo and Albuquerque and successfully running Stage 3 as
described above.

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
