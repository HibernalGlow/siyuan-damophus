# Use TinyBase as the synced Damophus data warehouse

Status: accepted on 2026-08-08.

Damophus will replace Question Index, Topic Index, and Attempt Log as runtime data sources with TinyBase `MergeableStore` repositories. Markdown and IAL remain authoritative for question content, stable question identity, question-to-topic references, and note-topic anchors; SiYuan SQL remains available for discovering blocks and attributes; Riff remains authoritative for scheduling. TinyBase owns the question catalog, anchor catalog, immutable attempt and exam events, resumable sessions, reusable question-set blueprints, and rebuildable aggregate caches.

This decision supersedes the attribute-view persistence parts of ADR 0002 and all of ADR 0006. The immutable event rule from ADR 0002 remains in force. Attribute views are not retained as projections: after a one-time, idempotent development migration and verification, runtime code must not read or write AV rows, keys, relations, or rollups. The old databases remain untouched until the user deletes them manually, and new TinyBase writes are never rolled back into AV.

## Storage and synchronization

Each SiYuan device writes only files under its own `window.siyuan.config.system.id` directory in `data/storage/petal/siyuan-damophus/store/devices/`. The device store is split into `core.json`, `sessions.json`, and annual immutable event shards such as `events/2026.json`. SiYuan transports these files; TinyBase performs semantic CRDT merging.

Damophus must not merge device stores during plugin startup. It listens for SiYuan `sync-end`, debounces duplicate notifications, and performs changed-shard loading, TinyBase merging, and validation in a Web Worker. A `sync-fail` event never triggers a merge. Until a merge succeeds, the UI continues using the last validated local state. Corrupt remote shards are quarantined and never replace valid state.

Annual event shards are the default because per-device ownership already removes same-file writer contention and normal annual volumes remain small. A shard emits a performance warning at 25 MB. Crossing 50 MB creates a planned migration to monthly shards; business repositories resolve shard routing through metadata and must not assume that every shard name is only a year.

## Why this is worth the migration

The existing design has crossed the point where attribute views are a low-cost index. Stable AV row identity, managed column keys, bidirectional relations, deletion recovery, schema upgrades, and rollup repair now constrain attempts, exams, topics, and future cross-document workflows. Those costs are structural consequences of using bound AV rows as business storage and would recur with each new feature.

TinyBase introduces a storage and synchronization adapter, but confines that complexity behind repositories and tests. Application code no longer depends on database-block lifecycle, reads become in-memory queries, immutable events survive source-block deletion, and SiYuan databases can be removed without disabling the question bank.

## Considered options

- Keep AV as the source of truth: rejected because the current maintenance and deletion behavior caused the migration.
- Keep AV as a display projection: rejected because it preserves binding, schema, repair, and deletion code without being required by current workflows.
- Use one synced TinyBase file: rejected because SiYuan synchronizes plugin files but does not semantically merge concurrent TinyBase content.
- Use RxDB or PouchDB: rejected because their normal persistence and replication models do not map directly to SiYuan-synchronized ordinary files across desktop and mobile.

## Consequences

- Cross-document catalog and filtering are implemented against TinyBase rather than first being built on AV.
- Topic identity is derived from IAL references and anchors; there is no separately editable topic table or topic-management UI.
- Aggregate values are caches rebuilt from events. Legacy rollups are comparison evidence during migration, never imported facts.
- The implementation must budget explicitly for file parsing, annual-shard growth, Worker merges, migration verification, and damaged-file recovery.
