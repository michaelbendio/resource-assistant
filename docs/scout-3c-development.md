# Scout 3C development review

This branch contains group navigation and the schema 4 package reader. See
`docs/resource-package-migrations.md` for the package contract.

The original main checkout has unrelated pending work, including a proposed
2.3.5 release. Michael approved this isolated checkout as 2.3.7/build 153,
including the open-question handoff. It must be integrated with the main
checkout work before any active-office publication. No main-checkout
changes or production office files were included in this development preview.
Version approval was supplied on September 6: “2.3.7 is good.” The open-question
label and unresolved question text are red and bold. The editor introduction
says only that Scout found specific questions it could not settle and that these
notes do not appear in patron handouts.

## Reproduce the preview and checks

```sh
python3 verify-tso-release
python3 make-scout-navigation-preview /path/to/historical-package.zip /path/to/autoProvoNavigationPreview.html
python3 tests/scout-navigation-browser-qa.py /path/to/autoProvoNavigationPreview.html --package /path/to/historical-package.zip --output /path/to/qa-results
```

The last command requires Playwright and an installed Google Chrome. It launches
a disposable browser profile; it never attaches to an existing browser session.
The preview uses `provo-scout-3c-preview` storage and embeds the original PDFs.
It does not apply Scout research proposals or category retirements. The header
identifies historical inventory rather than live office data.

The verified historical Provo v41 package has SHA-256
`dc883d19eff7a30e78d33df580ea8408a50788eade33647c40ec6a23f0201a49`.
All 183 resources' client text and all 93 PDF files survived an actual browser ZIP
save and reopen. Browser checks cover 768 × 1024 and 390 × 844 layouts, Type/group
intersection, rare and selected-zero groups, clear, keyboard focus and Space,
absence of prominence controls, ignored old prominence choices, print content,
and safe extension-field round trips.
The full verifier passed 42 Python tests and 139 browser self-tests.

Scout's `v2.0` branch separately accepts schemas 3 and 4. It keeps the legacy
alias export block for schema 3; schema 4 still requires all existing human
mapping and whole-plan approvals. The real Provo migration mappings remain
unapproved. Development review is not approval to retire a category.

## Simplified preview after Michael's device review

Michael confirmed that the original controls worked, but Education exposed their
lack of utility: Seniors (0) led to an empty page, and hiding Families with
children only made a useful filter harder to find. The revised preview removes
All groups, office-wide counts, and Show prominently. Matching groups are shown
directly; selecting a Type hides groups with no matches unless already selected.
Selected zero-match groups remain visible with Clear filters. Old saved prominence
choices no longer affect the display. No classification or resource text changed.

The updated banner says “Scout 3C simplified navigation preview.” It uses the same
preview filename and storage ID, so the regression check includes an earlier
saved setting hiding Families with children and proves Education still shows
Families with children (1), Spanish speaking (3), and Veterans (1).


## September 6 high-effort review

Question records now merge independently from contact and other service edits.
Regression cases cover a newer legacy record without questions, both merge
orders, resolution ancestry, reopening, conflicting curator notes and a later
settlement. Conflicts stay open with both decisions visible. Package validation
rejects malformed question records, duplicate IDs and invalid histories while
preserving valid unknown extension fields. These checks bring the browser
self-test count to 144; the Python suite has 42 tests.

The dedicated question browser check also exercises the full package merge with
a newer legacy contact edit, alongside list/editor saves, ZIP round trip, red/bold
labels, Cancel, reopen and patron-handout exclusion. Scout separately preserves
questions when combining research categories and prevents administrative question
resolutions from being counted as provider verification. The development preview
now uses plainer, evidence-specific explanations under versioned Scout guidance.
