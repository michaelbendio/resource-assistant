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

The five newest pre-merge data snapshots are retained locally, including guided
SharePoint merges. Each recovery point shows its date, package version, and source
filename. Restoring one does not remove the recovery history, but it does not remove
orphaned PDF blobs imported into IndexedDB.

Approved deletions are saved as compact tombstones in the resource package. A later
merge of an older package cannot recreate those resources or taxonomy entries.

## Guided SharePoint publishing

Each office file runs locally from its OneDrive shortcut, while SharePoint
authentication remains in Edge. The **Publish to SharePoint** button therefore uses
a guided local workflow instead of embedded Microsoft Graph authentication:

1. On first use on each computer, the admin opens **Office Setup** and reviews the TSO name, embedded storage ID, expected package filename, SharePoint URL, and download-folder authorization.
2. The admin selects or opens that office's canonical SharePoint ZIP, copies its complete address-bar URL, and pastes it into Office Setup.
3. The app accepts only an HTTPS URL on `churchofjesuschrist.sharepoint.com`, under the `WSR_TSO` site, whose selected ZIP filename matches the current office.
4. The app saves that destination and authorized folder in office-scoped browser storage. Neither configuration nor publishing history is part of a resource package.
5. The admin runs **Test Configuration** until Office Setup reports **Setup complete**.
6. The publishing panel opens the configured canonical SharePoint ZIP. After the admin clicks SharePoint's Download arrow, the app detects the completed ZIP.
7. The app displays **Merging**, saves a recovery point, merges the canonical package with prepared local data, reapplies deletion tombstones, incorporates referenced PDFs, and saves the combined canonical filename.
8. The app displays a publication summary with package version, filename, save time, resources added/updated, approved deletions, and SharePoint destination.
9. The admin chooses **Upload to SharePoint**, uploads the saved ZIP, and chooses **Replace**.
10. After SharePoint succeeds, the admin clicks **I replaced the package**. The app records that confirmation locally with the publishing history.

The app never receives SharePoint credentials and cannot bypass SharePoint
permissions. If Edge does not save into the authorized folder, the workflow falls
back to a file picker. The browser cannot verify the final SharePoint upload, so the
completion message records the administrator's confirmation rather than an API
response. If an office moves its canonical package, the admin can use **Change
SharePoint destination** and confirm a new selected-ZIP URL.
