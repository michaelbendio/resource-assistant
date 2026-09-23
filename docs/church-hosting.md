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
7. The admin manually uploads the saved package to the office SharePoint library and replaces the current package.

The five newest pre-merge data snapshots are retained locally. Each recovery point
shows its date, package version, and source filename. Restoring one does not remove the recovery history, but it does not remove
orphaned PDF blobs imported into IndexedDB.

Approved deletions are saved as compact tombstones in the resource package. A later
merge of an older package cannot recreate those resources or taxonomy entries.
