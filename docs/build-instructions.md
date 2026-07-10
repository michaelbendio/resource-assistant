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
