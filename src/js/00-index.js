/* ============================================================
TSO RESOURCE ASSISTANT — SECTION INDEX
The production deliverable is assembled from ordered source modules.
Edit the matching file under src/js rather than generated new.html.

SECTION ORDER (one source file each, concatenated in filename order)

10   UTILITIES
20   DATA NORMALIZATION
25   DELETION CORE
27   PACKAGE PIPELINE (read, migrate, normalize, apply tombstones, validate)
28   FOR-GROUP CHECKS
30   STATE
40   SAFETY HARNESS
50   RENDERING
60   UNDO AND VIEWS
70   FAVORITES, PRINT SELECTION AND PRINT WORKFLOW
80   EVENT HANDLERS AND ADMIN MODE
90   PERSISTENCE AND RESOURCE PACKAGES
95   DELETION WORKFLOW AND RECOVERY POINTS
100a SEARCH AND REFERENCE LOOKUPS
100b ADMIN EDITOR COORDINATION
100c CATEGORY EDITOR
100d RESOURCE EDITOR
100e FOR-GROUP EDITOR
110  APPLICATION SHORTCUTS
120  STARTUP

SUBSYSTEMS

PrintWorkflow
  The print preview: renders the selected resources (cards, then list
  flyers) or a single resource from the editor, and handles Print / Close.

AGENT EDITING RULES

1. Locate the correct section before editing.
2. Do not move section banners.
3. Do not duplicate rendering logic across sections.
4. Prefer minimal diffs rather than rewriting blocks.
============================================================ */
