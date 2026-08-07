# Use TinyBase as the synced Damophus data warehouse

Status: accepted on 2026-08-08.

Damophus will replace Question Index, Topic Index, and Attempt Log as runtime data sources with TinyBase `MergeableStore` repositories. Markdown and IAL remain authoritative for question content, stable question identity, question-to-topic references, and note-topic anchors; SiYuan SQL remains available for discovering blocks and attributes; Riff remains authoritative for scheduling. TinyBase owns the question catalog, anchor catalog, immutable attempt and exam events, resumable sessions, reusable question-set blueprints, and rebuildable aggregate caches.

This decision supersedes the attribute-view persistence parts of ADR 0002 and all of ADR 0006. The immutable event rule from ADR 0002 remains in force. Attribute views are not business storage: after a one-time, idempotent development migration and verification, normal question-bank code must not read or write AV rows, keys, relations, or rollups. Separately configured **Question Index Projection** and **Topic Index Projection** profiles are the only runtime exceptions; they are one-way, disposable views generated from TinyBase for personal browsing and filtering. The old databases remain untouched until the user deletes them manually, and new TinyBase writes are never rolled back into AV.

## Storage and synchronization

Each SiYuan device writes only files under its own `window.siyuan.config.system.id` directory in `data/storage/petal/siyuan-damophus/store/devices/`. The device store is split into `core.json`, `sessions.json`, and annual immutable event shards such as `events/2026.json`. SiYuan transports these files; TinyBase performs semantic CRDT merging.

Damophus must not merge device stores during plugin startup. It listens for SiYuan `sync-end`, debounces duplicate notifications, and performs changed-shard loading, TinyBase merging, and validation in a Web Worker. A `sync-fail` event never triggers a merge. Until a merge succeeds, the UI continues using the last validated local state. Corrupt remote shards are quarantined and never replace valid state.

Annual event shards are the default because per-device ownership already removes same-file writer contention and normal annual volumes remain small. A shard emits a performance warning at 25 MB. Crossing 50 MB creates a planned migration to monthly shards; business repositories resolve shard routing through metadata and must not assume that every shard name is only a year.

## Why this is worth the migration

The existing design has crossed the point where attribute views are a low-cost index. Stable AV row identity, managed column keys, bidirectional relations, deletion recovery, schema upgrades, and rollup repair now constrain attempts, exams, topics, and future cross-document workflows. Those costs are structural consequences of using bound AV rows as business storage and would recur with each new feature.

TinyBase introduces a storage and synchronization adapter, but confines that complexity behind repositories and tests. Application code no longer depends on database-block lifecycle, reads become in-memory queries, immutable events survive source-block deletion, and SiYuan databases can be removed without disabling the question bank.

## Considered options

- Keep AV as the source of truth: rejected because the current maintenance and deletion behavior caused the migration.
- Keep AV as a mandatory display projection: rejected because it preserves binding, schema, repair, and deletion code for workflows that do not need it.
- Keep optional Question Index and Topic Index AV projections: accepted because they are useful for personal browsing while remaining disposable, one-way, and outside the business data path.
- Use one synced TinyBase file: rejected because SiYuan synchronizes plugin files but does not semantically merge concurrent TinyBase content.
- Use RxDB or PouchDB: rejected because their normal persistence and replication models do not map directly to SiYuan-synchronized ordinary files across desktop and mobile.

## Consequences

- Cross-document catalog and filtering are implemented against TinyBase rather than first being built on AV.
- Topic identity is derived from IAL references and anchors; there is no separately editable topic table or topic-management UI.
- Aggregate values are caches rebuilt from events. Legacy rollups are comparison evidence during migration, never imported facts.
- Question Index and Topic Index projections may be refreshed independently for personal filtering, but stale or missing projection rows never block question-bank workflows.
- The implementation must budget explicitly for file parsing, annual-shard growth, Worker merges, migration verification, and damaged-file recovery.

## Optional Resource AV Projections

The projections are two independent opt-in personal views, not replacement databases:

- **Question Index Projection** shows question catalog, source location, topic IDs, availability, and rebuildable question aggregates.
- **Topic Index Projection** shows distinct topic IDs, anchor titles and locations, question counts, and rebuildable topic aggregates.

Each profile stores its selected target block, resolved AV ID, stable managed key IDs, selected projection fields, and refresh policy. Selecting a NodeAttributeView block automatically resolves its AV ID and initializes missing managed columns; users never need to copy key IDs. Question rows automatically bind to their current source question blocks. Topic rows automatically bind to the deterministically selected canonical note-topic anchor, and refresh rebinds them when that anchor changes. Neither profile writes back to TinyBase, Markdown, IAL, Attempt Events, or Exam Events.

Projected columns are limited to browse-oriented data such as stable question ID, title, document location, question type, year, subject, category, collection, source, topic IDs, availability, anchor locations, and rebuildable aggregate summaries. Neither profile projects detached attempt rows, event payloads, AV relations, or rollups that would become a second fact source.

Each profile independently chooses its projected fields and whether refresh is manual or follows a completed catalog refresh. Refresh is never executed after every answer and never runs during a SiYuan sync. Every refresh has a preview and an explicit **overwrite managed projection** confirmation. Projection rows are identified by stable TinyBase IDs; AV row IDs, column names, table names, and select/multi-select labels are adapter details. Chinese display names and options are fully supported because code resolves columns by stable key IDs, not by display names. Missing columns produce a preview and opt-in repair, never silent database creation.

If either selected AV is deleted or its rows disappear because a source block was deleted, that profile is simply unavailable until the user selects or reconnects a target and refreshes it. Overwrite affects only Damophus-managed rows and columns; unknown user columns are preserved. A failed or stale projection is reported as a display issue only. Removing either projection has no effect on practice, exams, history, statistics, or website reuse.
