# AutoCurator

AutoCurator turns a Resource Scout candidate package into a normal TSO Resources
HTML file populated with curated resources. It is not a separate review
dashboard. The generated file keeps the familiar TSO Resources reading,
searching, printing, and Admin editing interface.

## Candidate package intake

Resource Scout saves one location package such as `mesa-candidates.zip`. The ZIP
contains `scout-candidates.json`, including the location, category definitions,
completed discovery runs, consolidated candidates, excluded unavailable leads,
source-only records, and original chat responses.

AutoCurator rejects an invalid package, an unfinished category, or a category
with no Scout candidates. The generated HTML records the candidate package's
SHA-256 digest so its research source can be identified later.

## First-cut Employment flow

The current first cut is intentionally narrow:

1. Scout saves `mesa-candidates.zip`.
2. AutoCurator consolidates and researches the Employment candidates, producing
   ordinary resource fields for human review.
3. `make-autocurator` combines those curated resources with the candidate
   package and the regular TSO Resources application.
4. The result is `autoMesa.html`: all normal categories remain visible, but only
   Employment is populated.
5. Stephanie reviews and edits Employment through the normal Admin resource
   editor.
6. `Save Employment Resource Package` saves a standard, mergeable resource
   package containing only Employment and its referenced `For` values.
7. That package can be merged into `mesa.html` through its normal merge flow.

Example build:

```sh
python3 make-autocurator mesa-candidates.zip \
  --category employment \
  --seed auto-mesa-employment-resource-package.json \
  --output autoMesa.html
```

The curated seed is AutoCurator's intermediate output, not something the human
reviewer prepares. Later stages can repeat the same flow category by category
and make category selection part of AutoCurator itself.

## Package boundary

`autoMesa.html` uses separate browser storage from `mesa.html`. Saving its
Employment package does not alter the connected Mesa source package or the live
Mesa HTML. The merge into `mesa.html` remains an explicit human action.
