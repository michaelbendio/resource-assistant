# Church-hosted TSO Resources workflow

Each office has one HTML file and one current resource package in the Transitional
Services Office SharePoint Resources library. A missionary uses **Add shortcut to
OneDrive** on that library, then bookmarks the office HTML through the shortcut.
Because the shortcut reflects the SharePoint file, missionaries receive published
HTML updates without replacing their bookmarks or keeping separate HTML copies.

## Phase 1 package workflow

The office HTML stores working data in browser localStorage and PDF blobs in
IndexedDB. Resource package ZIPs are therefore the shared data artifact; editing in
a browser does not rewrite the HTML file or the package stored in SharePoint.

1. A resource missionary merges the latest office package before editing.
2. The missionary makes changes locally. Delete actions only tag items for deletion.
3. The missionary saves a resource package and sends it to the office admin.
4. The admin merges that package into the current office package.
5. Tagged deletions are reviewed immediately, with affected resources shown and a printable working list available.
6. The admin approves selected deletions, makes any additional edits needed for knock-on effects, and saves the merged package.
7. The admin manually replaces the current package in SharePoint.

One full pre-merge data snapshot is retained locally. It can return the admin to the
state immediately before the latest merge, but it is not a multi-level history and
does not remove orphaned PDF blobs imported into IndexedDB.

Approved deletions are saved as compact tombstones in the resource package. A later
merge of an older package cannot recreate those resources or taxonomy entries.

## Deferred Phase 2

Phase 2 will add the hidden `Ctrl+Alt+P` admin publishing action. It will download
the current SharePoint package, merge it with the admin's working data, and replace
the SharePoint package while showing progress. Implementation is deferred until the
office Edge address-bar URL can be inspected, because the actual execution origin
determines the supported SharePoint authentication and upload mechanism.
