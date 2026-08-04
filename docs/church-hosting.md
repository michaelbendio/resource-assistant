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
7. The admin uses **Publish to SharePoint** to combine the current canonical package with the prepared local data, then manually replaces the SharePoint file when prompted.

One full pre-merge data snapshot is retained locally. It can return the admin to the
state immediately before the latest merge, but it is not a multi-level history and
does not remove orphaned PDF blobs imported into IndexedDB.

Approved deletions are saved as compact tombstones in the resource package. A later
merge of an older package cannot recreate those resources or taxonomy entries.

## Guided SharePoint publishing

Each office file runs locally from its OneDrive shortcut, while SharePoint
authentication remains in Edge. The **Publish to SharePoint** button therefore uses
a guided local workflow instead of embedded Microsoft Graph authentication:

1. On first use on each computer, the admin selects or opens that office's canonical SharePoint ZIP, copies its complete address-bar URL, and pastes it into the publishing panel.
2. The app accepts only an HTTPS URL on `churchofjesuschrist.sharepoint.com`, under the `WSR_TSO` site, whose selected ZIP filename matches the current office. It displays the parsed office, package, and containing folder for confirmation.
3. The app saves that destination in office-scoped browser storage. The destination is not part of a resource package and therefore cannot be changed by package import or merge.
4. The admin authorizes the folder where Edge saves downloads.
5. The publishing panel opens the configured canonical SharePoint ZIP. After the admin clicks SharePoint's Download arrow, the app detects the completed ZIP.
6. The app displays **Merging**, merges the canonical package with prepared local data, reapplies deletion tombstones, incorporates referenced PDFs, and saves the combined canonical filename.
7. The app displays **Merge complete** and opens the configured office folder when the admin chooses **Upload to SharePoint**.
8. The admin uploads the saved ZIP and chooses **Replace**. After SharePoint succeeds, the admin confirms the replacement in the publishing panel.

The app never receives SharePoint credentials and cannot bypass SharePoint
permissions. If Edge does not save into the authorized folder, the workflow falls
back to a file picker. The browser cannot verify the final SharePoint upload, so the
completion message records the administrator's confirmation rather than an API
response. If an office moves its canonical package, the admin can use **Change
SharePoint destination** and confirm a new selected-ZIP URL.
