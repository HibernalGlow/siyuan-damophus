# Migration Guide

> **Current runtime (2026-08-08).** The legacy AV initialization and binding instructions in this file apply only to workspaces that have not completed the development cutover. The current plugin uses TinyBase for catalog, sessions, events, blueprints, and aggregates. Follow [TinyBase Migration Plan](tinybase-migration-plan.md) and [ADR 0008](adr/0008-tinybase-synced-data-warehouse.md) for new workspaces and post-cutover behavior. The old AV databases are migration input only; they are not dual-written or used as a fallback.

## TinyBase Development Migration

The one-time migration is a read-only inventory followed by an idempotent import. Run the exporter and importer from the plugin repository:

```text
pnpm export:tinybase-inventory -- --workspace D:/1STUDY/SIYUAN --output D:/path/inventory.json
pnpm migrate:tinybase -- --input D:/path/inventory.json --workspace D:/1STUDY/SIYUAN --device-id migration-legacy
```

The importer writes device-sharded files under `data/storage/petal/siyuan-damophus/store/` and a `migration-report.json`. Re-running the same inventory is safe: identical immutable event IDs are counted as duplicates, conflicting payloads remain blockers, and `migration_version` is set to `1` only when the report has no conflicts. The verified workspace migration on 2026-08-08 imported 7 documents, 67 questions, 111 question-topic links, 43 topic anchors, and 5 attempts with no conflicts; the idempotent rerun created 0 attempts and detected 5 duplicates.

## From siyuan-hqweay-go

Damophus uses the plugin ID `siyuan-damophus`, so SiYuan installs it as a separate plugin. Existing `siyuan-hqweay-go` settings are not migrated automatically.

Damophus does not carry over the upstream Dashboard, link/reference conversion, typography, quick attribute actions, list view conversions, Memo, EPUB, OCR, VoiceNotes, journal, random question image, synchronization, or other general-purpose tools. Keep `siyuan-hqweay-go` installed when you need those features.

The only retained upstream-derived utility is block attribute display, narrowed to question-bank identity markers. By default it shows `qb-id` and `qb-type` on supported blocks, excludes tables, and always suppresses `custom-qb-answer`.

## Initialize The Question Bank

Upgrading does not scan or modify documents automatically. Open Damophus, preview initialization, confirm the system document, then scan each intended question-bank document manually. Resolve all reported conflicts before confirming an index sync.

New Damophus system documents store a recoverable binding manifest on the document itself. If plugin settings are lost later, use the reconnection flow rather than creating a second system document.

Bindings created before Topic Index use schema version 3 or earlier. Reconnection previews the schema version 5 upgrade, adds the Topic Index and the Question Index `Topics` relation only after confirmation, preserves existing Question Index and Attempt Log rows, and keeps unknown user columns unchanged.

Schema version 5 adds Topic Index `Question ID Snapshot`, a managed recovery field keyed by stable `custom-qb-id`. Existing version 4 bindings receive the field only after the reconnection preview is confirmed. The snapshot preserves topic assignments while a bound Question Index row is temporarily absent and restores them when the same stable question ID is indexed again.

Existing question content must follow [Question Bank Contract](question-bank-contract.md). A permanent `custom-qb-id` is required for indexed questions. SiYuan block IDs, visible question numbers, and database row IDs are not substitutes.

Safe structural inferences are listed during scan and persisted only after confirmation. Existing explicit metadata is authoritative: invalid values stop that question from being indexed instead of being silently replaced.

## Existing Flashcards

Damophus uses SiYuan's built-in quick-card deck and does not import legacy custom deck classification. Existing quick cards remain owned by SiYuan and are recognized when their block IDs match indexed question title blocks.

## Recovery Archives

Attempt archives use schema version 1. Import is additive and deduplicates by `attempt_id`. Importing the same archive more than once does not duplicate existing events. Events whose `question_id` is not currently indexed are imported and listed as orphans.

Question navigation relations are workspace-local. During import, Damophus replaces archived relations with the current indexed question block ID and clears the relation for orphan events.

Before changing workspaces or rebuilding the Damophus system document, export attempt history and retain the JSON archive with the normal SiYuan backup.
