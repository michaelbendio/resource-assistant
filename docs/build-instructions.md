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

## Local TSO Resources file

Create an office-specific HTML file:

```sh
python3 make-local-tso albuquerque
```

On a Mac with iCloud Drive enabled, this also copies `albuquerque.html` to
`iCloud Drive/Documents/TSO`. To keep the `TSO` folder available offline on an
iPhone or iPad, open Files, locate the folder in iCloud Drive, touch and hold it,
and choose **Keep Downloaded** on each device.

To create only the repository copy:

```bash
python3 make-local-tso albuquerque --no-icloud-copy
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

## Windows

From PowerShell or Command Prompt, use `python` instead of `python3`:

```powershell
cd path\to\resource-assistant
python build-tso-resources
python build-tso-resources --with-tests
python make-local-tso provo
```

If Windows uses the Python launcher:

```powershell
py -3 build-tso-resources
py -3 build-tso-resources --with-tests
py -3 make-local-tso provo
```

## Editing rule

Make future application changes in `src/`, `tests/`, or `vendor/`. Do not edit the
generated `new.html` directly.

Every commit is also an app release. Before committing, update `src/release.json`
with the proposed version, current date, and the exact commit subject, then rebuild
both outputs. `includedCommits` contains the full Git IDs selected for the visible
14-day app change log; entries older than 14 days are automatically omitted. Use
the next patch version by default and ask for approval with:

```text
Commit as version X.Y.Z? Reply y or provide a version number.
```

Do not commit or push until that approval is received.
