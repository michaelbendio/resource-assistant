# TSO Resources Build Instructions

Run all commands from the `resource-assistant` repository:

```sh
cd ~/resource-assistant
```

## Production deliverable

Build the single-file deliverable without browser tests:

```sh
python3 build-tso-resources
```

Output:

```text
new.html
```

## Verify an application release

Run the complete office-neutral release verification before requesting commit
approval:

```sh
python3 verify-tso-release
```

This builds production and debug outputs, runs every Python test, runs every
headless-browser self-test, checks that both generated outputs remain current,
and verifies the starter identity and exact embedded release metadata in
`new.html`. It has no office list and does not copy or publish office files.

After the approved commit has been pushed, run the mandatory final check:

```sh
python3 verify-tso-release --require-pushed
```

This additionally requires a clean worktree, a pushed upstream commit, and an
exact match between the commit subject and the message in `src/release.json`.

## Debug version

Build the debug version with all browser self-tests:

```sh
python3 build-tso-resources --with-tests
```

Output:

```text
build/tso-resources-debug.html
```

Open the debug HTML file and press `Ctrl+Shift+T` to run the tests.

Run the same tests automatically in an installed Edge, Chrome, or Chromium browser:

```sh
python3 run-browser-self-tests
```

Set `TSO_BROWSER` to the browser executable path if automatic discovery does not
find the intended browser.

## Local TSO Resources file

Create an office-specific HTML file:

```sh
python3 make-local-tso albuquerque
```

This first rebuilds `new.html`, then creates `albuquerque.html` with the correct
storage ID and the title `Albuquerque TSO Resources`.

For another office:

```sh
python3 make-local-tso provo
```

For a custom output filename:

```sh
python3 make-local-tso albuquerque --output albq.html
```

The generator does not copy the result. Copy one generated office file to an
explicit destination with:

```sh
python3 copy-local-tso albuquerque.html /path/to/destination
```

This validates the office file, copies it atomically, and verifies byte parity.
It has no default destination and works with iCloud, OneDrive, removable media,
or another explicitly selected directory.

At Michael's TSO Windows workstation on Tuesdays and Thursdays, the separate
office-publication commands after an approved release are:

```powershell
python make-local-tso albuquerque
python make-local-tso provo
python copy-local-tso albuquerque.html E:\TSO
python copy-local-tso provo.html E:\TSO
```

If `E:\TSO` is unavailable, stop rather than substituting a different location.

## Windows

From PowerShell or Command Prompt, use `python` instead of `python3`:

```powershell
cd path\to\resource-assistant
python build-tso-resources
python build-tso-resources --with-tests
python verify-tso-release
python make-local-tso provo
python copy-local-tso provo.html E:\TSO
```

If Windows uses the Python launcher:

```powershell
py -3 build-tso-resources
py -3 build-tso-resources --with-tests
py -3 verify-tso-release
py -3 make-local-tso provo
py -3 copy-local-tso provo.html E:\TSO
```

## Editing rule

Make future application changes in `src/`, `tests/`, or `vendor/`. Do not edit the
generated `new.html` directly.

Every commit is also an app release. Before committing, update `src/release.json`
with the proposed version, current date, and the exact commit subject, then run
`verify-tso-release`. Preserve the existing app change-log history unless the
user selects a different visible set. Use the next patch version by default and
ask for approval with:

```text
Commit as version X.Y.Z? Reply y or provide a version number.
```

Do not commit or push until that approval is received.
