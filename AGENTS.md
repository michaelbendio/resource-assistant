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
approved release has been pushed, generate `albuquerque.html` and `provo.html`
individually and copy both to `E:\TSO` when that drive is available. Treat this
as two explicit office publications, not a general release step. If `E:\TSO` is
unavailable, stop with an error; do not substitute iCloud or another location.

## Commit and version workflow

Every commit must bump the app version. Use the next patch version by default,
unless the user provides another version. Before committing:

1. Update `src/release.json` with the proposed version, current date, and exact
   planned commit subject. Preserve the existing change-log history unless the
   user selects a different visible set.
2. Run `python3 verify-tso-release`. This rebuilds both outputs and runs all
   Python and browser tests.
3. Ask: `Commit as version X.Y.Z? Reply y or provide a version number.`

Do not commit or push until the user replies `y` or supplies the version to use.

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
