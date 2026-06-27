# Resource Assistant

Single-file HTML resource assistant for Transitional Services offices.
`new.html` is the starter app. Make a local TSO copy from it, for example:

```sh
python3 make-local-tso albuquerque
```

That creates `albuquerque.html`, sets the local storage id to `albuquerque`, and sets the page title to `Albuquerque TSO Resources`.

## Local admin quick start

Open the local `.html` file directly in a browser. The file starts with the standard categories and no resources.

1. Press `Ctrl+Alt+A` to show the `Admin` button in the blue bar.
2. Click `Admin`.
3. If this is a fresh template file, click `Change TSO Name`, enter the local TSO name, and save it.
4. Click `Help` in Admin mode for the admin reference and printable first-time admin training guide.

Before editing live resources, load the latest resource package:

1. Go to `Categories`.
2. Click `Merge Resources`.
3. Choose the latest resource package JSON file.
4. Wait for the merge to finish before making edits.

After a batch of edits, share the updated resources:

1. Click `Show change log` and review the listed changes.
2. Click `Save Resource Package`.
3. Save the exported JSON file.
4. Share that JSON file through the normal distribution process.

Admin edits are saved in the browser first. They are not shared with anyone else until a new resource package is exported.
