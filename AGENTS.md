# Repository instructions

## Make a local TSO HTML file

When the user says something like:

> Make albuquerque

interpret that as a request to generate a local TSO HTML file from `new.html`.

Run:

```sh
python3 make-local-tso albuquerque
```

This creates or overwrites `albuquerque.html`, sets:

```html
<meta name="tso-storage-id" content="albuquerque">
```

and changes the page title to:

```html
<title>Albuquerque TSO Resources</title>
```

The JavaScript localStorage keys are not edited one by one. They are derived at runtime from the `tso-storage-id` value, so setting the meta tag changes the effective keys to `albuquerqueData`, `albuquerquePrintSelection`, `albuquerqueTsoName`, and the other generated keys.

For a different output filename, use `--output`, for example:

```sh
python3 make-local-tso albuquerque --output albq.html
```

Do not modify `new.html` when making a local TSO file.
