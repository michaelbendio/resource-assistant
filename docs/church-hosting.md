# Church-hosted TSO Resources direction

The long-term goal is one centrally hosted TSO Resources application per office,
available on Church infrastructure. Interview and intake missionaries should see
published changes without downloading HTML files or manually merging packages.

## Current transition

Until central hosting is available, each office continues to use its renamed local
HTML file and office-specific resource package ZIP. Resource packages are the shared
data artifact; editing resources in a browser does not rewrite the HTML file.

For Albuquerque's initial opening, use a small published-package workflow:

1. Resource missionaries merge the office's latest package before editing.
2. They make and review changes locally.
3. One current office package is distributed to each TSO Resources computer.
4. The installed package version is recorded for each computer.

PDF distribution is intentionally outside the first Albuquerque hosting milestone.

## Target Microsoft architecture

The preferred Microsoft 365 target is a SharePoint Framework (SPFx) full-page
application with Microsoft identity and SharePoint-hosted office data.

- One application codebase serves multiple TSOs.
- Each TSO has an explicit office identity and a disjoint resource collection.
- Interview and intake missionaries receive read access.
- Authorized resource missionaries receive edit access.
- The Church employee managing the TSO controls membership and governance.
- Resources are stored individually so different admins can edit different records
  without replacing one large package.
- Established resources are retired rather than immediately destroyed, preserving
  history and allowing restoration.

Microsoft identifies SPFx as its supported SharePoint customization model:

- <https://learn.microsoft.com/sharepoint/dev/spfx/sharepoint-framework-overview>
- <https://learn.microsoft.com/sharepoint/dev/spfx/web-parts/single-part-app-pages>

Uploading the current HTML to a document library is not, by itself, central hosting.
The current application persists authoritative data in browser localStorage and PDF
blobs in IndexedDB. Multiple computers would still have separate data.

## Migration seams

The modular build is the first migration step. The next implementation step is a
storage interface with operations such as:

```text
loadOfficeData
createResource
updateResource
retireResource
restoreResource
saveCategory
loadChanges
```

The local implementation will continue to use localStorage and IndexedDB. A later
SPFx implementation will use SharePoint lists and libraries. Rendering and editing
code should call that interface instead of accessing browser storage directly.

After that boundary exists, migration can proceed in stages:

1. Import a TSO's latest resource package into its central SharePoint data.
2. Authenticate users through Microsoft 365.
3. Derive admin capability from SharePoint permissions rather than a keyboard
   shortcut.
4. Add optimistic conflict checks when two admins edit the same resource.
5. Retain localStorage only as a last-known read-only cache for network outages.
6. Keep package import/export as backup and migration tools rather than daily
   distribution.

Provo is the appropriate operational pilot after the storage boundary is ready.
Albuquerque resource discovery should continue in the current application and can
be imported from its latest package when central hosting becomes available.
