# Resource package schemas and migrations

TSO Resources imports package JSON through one ordered pipeline:

```text
read → migrate schema versions → normalize → apply deletion tombstones → validate
```

The same processor is used for direct package merges, guided SharePoint
publishing, saved browser data, merge results, and package export. A compatibility
change belongs in a schema migration rather than in a later normalization step.

Current packages also record `packageCreatedAt`, an ISO timestamp written when
the ZIP is built. The Recent Updates screen uses this value instead of the local
merge time. Packages created before this field existed fall back to their
package-level `lastModified` value when imported.

## Supported schemas

### Schema 1 — unversioned legacy packages

Packages without `resourcePackageSchemaVersion` are treated as schema 1. The
schema 1 to 2 migration consumes known legacy fields, including:

- top-level and resource `For` values;
- category `Types` values;
- resource `Types` maps;
- older information, PDF, tag, and display fields.

Both comma-separated strings and arrays are supported for legacy `For` and Type
labels. Known obsolete fields are removed only after their supported values have
been transferred.

### Schema 2 — historical office packages

Schema 2 is the format used by historical Albuquerque and Provo-era packages
before the deletion workflow. Its migration adds the deletion-request and
tombstone containers required by schema 3. Existing string or array `forGroups`
and category-filter values are normalized afterward.

### Schema 3 — current packages

Schema 3 stores pending deletion requests and approved deletion tombstones.
Tombstones are normalized and applied before final validation so older package
content cannot recreate an approved deletion.

## Package versions

`packageVersion` is separate from `resourcePackageSchemaVersion`:

- numeric values are preserved;
- numeric strings are converted to numbers;
- missing, blank, or explicit `Unknown` values become `Unknown`;
- other values stop the import with an explanatory error.

Merging retains the highest numeric package version available.

## Safe-field preservation

Migrations change only fields they explicitly understand. Unknown JSON-safe
fields on the package, category, resource, and PDF records are retained through
migration, merging, and package re-export. Local-only state such as
`lastLoadedPackageInfo` and category-preset bookkeeping is never exported.

## Unsafe and unsupported packages

Import stops before changing browser data when a package cannot be migrated
safely. Examples include:

- malformed JSON or a non-object JSON root;
- unsupported past or future schema numbers;
- required containers that are not arrays;
- invalid For, Type, category-filter, PDF, or deletion-record shapes;
- duplicate IDs or category migrations that cannot be resolved safely.

The error names the submitted file and lists the fields that need correction.
Packages using a future schema must be opened with a newer TSO Resources app.

## Adding a schema

When the package structure must change:

1. Increase `RESOURCE_PACKAGE_SCHEMA_VERSION`.
2. Add one focused `N → N+1` migration to
   `src/js/27-package-pipeline.js`.
3. Keep normalization limited to the current canonical shape.
4. Add or update fixtures in `tests/fixtures/package-fixtures.js`.
5. Add regression tests for migration, tombstones, validation failures, and
   unknown-field preservation.
6. Run `verify-tso-release` before requesting version approval.
