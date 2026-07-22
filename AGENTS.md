# Repository instructions

## Make a local TSO HTML file

When the user says something like:

> Make albuquerque

interpret that as a request to generate a local TSO HTML file from `new.html`.

Run:

```sh
python3 make-local-tso albuquerque
```

The helper rebuilds `new.html` from the modular sources before copying it. Edit
files under `src/`, `tests/`, or `vendor/`; do not edit generated `new.html`.

This creates or overwrites `albuquerque.html`, sets:

```html
<meta name="tso-storage-id" content="albuquerque">
```

and changes the page title to:

```html
<title>Albuquerque TSO Resources</title>
```

On macOS, the helper also copies the finished office-specific HTML file to
`iCloud Drive/Documents/TSO` when iCloud Drive Documents is available. Use
`--no-icloud-copy` only when the user does not want that synced copy.

The JavaScript localStorage keys are not edited one by one. They are derived at runtime from the `tso-storage-id` value, so setting the meta tag changes the effective keys to `albuquerqueData`, `albuquerquePrintSelection`, `albuquerqueTsoName`, and the other generated keys.

For a different output filename, use `--output`, for example:

```sh
python3 make-local-tso albuquerque --output albq.html
```

Do not modify `new.html` when making a local TSO file.

## Commit and version workflow

Every commit must bump the app version. Use the next patch version by default,
unless the user provides another version. Before committing:

1. Update `src/release.json` with the proposed version, current date, and exact
   planned commit subject. Preserve `includedCommits` unless the user selects a
   different set for the visible 14-day app change log.
2. Rebuild and test the generated outputs.
3. Ask: `Commit as version X.Y.Z? Reply y or provide a version number.`

Do not commit or push until the user replies `y` or supplies the version to use.

## Mandatory production release

After an approved release commit has been pushed, do not report the release as
complete until this command succeeds:

```sh
python3 publish-tso-release
```

This is the required final release step. It builds and tests the modular app,
generates `new.html`, `provo.html`, and `albuquerque.html`, copies only
`provo.html` and `albuquerque.html` to `iCloud Drive/Documents/TSO`, and verifies
their byte parity, app version, storage IDs, and page titles. The generated
`new.html` remains a local build artifact and is not copied to iCloud Drive. The
command must fail rather than silently skip publication when iCloud is
unavailable, release files are uncommitted, the current commit has not been
pushed to its upstream branch, or any verification differs.

Do not substitute a manual checklist for this command. Do not report a release
as complete based only on a successful build, commit, or push.
