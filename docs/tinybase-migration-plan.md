# TinyBase Migration Plan

Status: completed on 2026-08-08.

Completion evidence: runtime cutover, worker-backed synchronization, and the development migration are implemented. The verified workspace report is `D:/1STUDY/SIYUAN/data/storage/petal/siyuan-damophus/store/migration-report.json`; it records `migration_version = 1`, no conflicts, and an idempotent rerun with 0 created and 5 duplicate attempts. The migration input inventory is `D:/1Dev/Python/temp/damophus-inventory-20260808.json`.

Validation completed with 46 Node test files / 239 tests, 30 Browser Mode files / 139 tests, Svelte/TypeScript checks, production build, smoke checks, and package validation. The three real workspace envelopes passed content-hash verification; their business row counts match the inventory and report.

The completed build was atomically deployed to `D:/1STUDY/SIYUAN` and reloaded in the running SiYuan 3.8.0-alpha.3 process. The live petal response contains the TinyBase store path and Worker asset reference, the Worker asset returns HTTP 200, and the kernel log confirms `siyuan-damophus` in the reloaded desktop petal set.

This plan replaces the Damophus attribute-view data model with a file-synchronized TinyBase data warehouse. It is a one-way development migration: after cutover, Question Index, Topic Index, and Attempt Log are legacy input only and the user removes them manually after verifying the result.

## Goals

1. Remove every runtime read and write dependency on SiYuan attribute-view database blocks.
2. Preserve Markdown and IAL as the portable source for question content and topic references.
3. Preserve immutable attempt and exam history when source blocks or old AV rows disappear.
4. Use SiYuan file synchronization without implementing a custom merge algorithm.
5. Keep plugin startup free of cross-device loading and merging work.
6. Build cross-document discovery directly on TinyBase instead of adding another AV-backed implementation.
7. Make migration repeatable, auditable, and safe to rerun until cutover succeeds.
8. Offer independent, optional Question Index and Topic Index AV projections for personal browse and filter workflows.

## Non-goals

- Replacing SiYuan's internal SQLite index or banning `/api/query/sql`.
- Replacing SiYuan block, attribute, file, or Riff APIs.
- Copying question bodies, answers, or solutions into TinyBase as authoritative content.
- Shipping a topic-management UI.
- Maintaining AV projections as business storage after cutover.
- Providing rollback to AV after TinyBase accepts new writes.
- Migrating the empty legacy Topic Index resource columns.

## Ownership after cutover

| Data | Authority | Notes |
| --- | --- | --- |
| Question body, options, answer, solution | Markdown blocks | Existing read-only content boundary remains unchanged. |
| Stable question identity and static metadata | `custom-qb-*` IAL | TinyBase keeps a rebuildable catalog snapshot. |
| Question-to-topic references | `custom-qb-question-topic-ids` | TinyBase materializes a many-to-many index. |
| Topic learning-material providers | `custom-qb-note-topic-id` anchors | SQL discovers anchors; no editable topic entity exists. |
| Question and source catalog | TinyBase core store | Rebuilt incrementally from SQL candidates and document scans. |
| Attempt and exam facts | TinyBase annual event stores | Append-only and deduplicated by stable event ID. |
| Practice and exam progress | TinyBase session store | Whole-snapshot conflict units with revision validation. |
| Reusable question-set blueprints | TinyBase core store | Migrated from plugin settings. |
| Counts, accuracy, review streaks, duration | TinyBase aggregate cache | Always rebuildable from events. |
| Personal question browse/filter view | Question Index Projection | TinyBase -> selected AV only; disposable and never read by business logic. |
| Personal topic browse/filter view | Topic Index Projection | TinyBase -> selected AV only; disposable and never read by business logic. |
| Scheduling | SiYuan Riff | Existing adapter and behavior remain unchanged. |
| Ordinary plugin preferences | Plugin settings | Theme and UI preferences are not business data. |

## File layout

```text
data/storage/petal/siyuan-damophus/store/
└─ devices/
   └─ <siyuan-system-id>/
      ├─ core.json
      ├─ sessions.json
      └─ events/
         ├─ 2025.json
         ├─ 2026.json
         └─ 2027.json
```

The device identifier is `window.siyuan.config.system.id`, an established per-device SiYuan identity. No shared writable manifest is required: directory listing discovers device and event shards, while schema and routing versions live inside every validated file envelope.

Each file envelope contains:

```ts
interface DamophusStoreEnvelope {
  format_version: 1;
  store_kind: "core" | "sessions" | "events";
  device_id: string;
  shard_id: "core" | "sessions" | string;
  schema_version: number;
  updated_at: string;
  content_hash: string;
  mergeable_content: unknown;
}
```

Zod validates the envelope before TinyBase receives its content. `content_hash` detects truncation and accidental replacement. Invalid files are copied to a quarantine location or exposed for diagnostic export; they never initialize an empty authoritative store.

Each device file is a **contribution store**, not a rewritten copy of the global state. Local writes update the current device contribution and the in-memory merged view. Post-sync processing builds a fresh read view by merging all validated contributions, but it never persists another device's contribution into the local file. This prevents quadratic file growth and keeps every synchronized file single-writer.

### Event shard routing

- Route by the four-digit year in the validated event `answered_at` value.
- Use annual files by default.
- Warn when one device's annual shard exceeds 25 MB.
- At 50 MB, require a schema migration that routes that year to monthly shards.
- Repository code asks a `ShardRouter`; it never constructs `events/${year}.json` directly.

## TinyBase stores

TinyBase cells hold strings, numbers, booleans, or null-like absence. Arrays and complete domain snapshots are stored as canonical JSON strings and validated with the existing Zod domain schemas when materialized.

### Core store

#### `source_documents`

Row ID: SiYuan document root ID.

| Cell | Purpose |
| --- | --- |
| `notebook_id` | SiYuan notebook identity |
| `title` | Last observed document title |
| `path` / `hpath` | Navigation metadata |
| `source_updated_at` | Last observed SiYuan update value |
| `content_signature` | Scanner input signature |
| `scan_status` | `valid`, `partial`, `invalid`, or `unavailable` |
| `issue_count` | Last scan issue count |
| `indexed_at` | Last successful catalog update |

#### `questions`

Row ID: stable `custom-qb-id`.

| Cell | Purpose |
| --- | --- |
| `block_id` | Current SiYuan source block |
| `document_id` / `notebook_id` | Current source location |
| `question_type` | Validated question type |
| `title` | Last observed display title |
| `year`, `subject`, `category`, `collection`, `source` | Searchable static metadata snapshot |
| `parent_id` | Stable group identity when applicable |
| `content_signature` | Detects structural source change |
| `indexed_at` | Last successful scan time |
| `available` | Active catalog eligibility |

TinyBase does not own question stem, options, answer, or solution. Practice hydration rescans the source document and validates its current content.

#### `question_topics`

Row ID: deterministic encoding of question ID and topic ID.

| Cell | Purpose |
| --- | --- |
| `question_id` | Stable question reference |
| `topic_id` | Stable IAL topic reference |
| `document_id` | Source document for invalidation |

#### `topic_anchors`

Row ID: SiYuan anchor block ID.

| Cell | Purpose |
| --- | --- |
| `topic_id` | `custom-qb-note-topic-id` value |
| `document_id` / `notebook_id` | Navigation location |
| `title` | Last observed anchor heading or label |
| `path` / `hpath` | Navigation metadata |
| `source_updated_at` | Invalidation metadata |
| `available` | Whether the source block still exists |

There is no `topics` table. Topic lists are derived from distinct IDs in `question_topics` and `topic_anchors`. Multiple anchors with the same ID are all valid providers.

#### `question_aggregates`

Row ID: stable question ID. Cells mirror `AttemptAggregate`: attempt totals, objective totals, streaks, latest rating, last event identity, and duration values. This table is replaceable cache data.

#### `question_set_blueprints`

Row ID: `blueprint_id`. Store `revision`, `updated_at`, and one canonical `snapshot_json` validated by `QuestionSetBlueprintSchema`. The full snapshot is the conflict unit.

#### Core values

- `schema_version`
- `migration_version`
- `last_catalog_scan_at`
- `last_aggregate_rebuild_at`
- `last_successful_merge_at`

### Session store

#### `practice_session_versions`

Row ID: deterministic encoding of `source_key` and origin device ID. Store `source_key`, `device_id`, `session_id`, `revision`, `updated_at`, and canonical `snapshot_json`. The whole snapshot is one logical conflict unit; TinyBase must not combine drafts from one device with navigation state from another.

#### `exam_session_versions`

Row ID: deterministic encoding of `exam_id` and origin device ID. Store `exam_id`, `device_id`, `revision`, `status`, `updated_at`, and canonical `snapshot_json` validated by `ExamSessionSnapshotSchema`.

Same-device multi-window exclusion keeps the existing Web Locks / `broadcast-channel` lease. Because device versions occupy different rows, merging preserves both complete snapshots. When multiple device versions for one logical session differ, the UI requires an explicit choice and writes a new winning version on the current device; it never field-splices snapshots.

### Annual event store

#### `attempt_events`

Row ID: `attempt_id`. Store every `AttemptEvent` field. Array fields use canonical JSON strings. Rows are append-only; inserting an existing ID with different content is a conflict, not an update.

#### `exam_events`

Row ID: the current stable event `attempt_id`. Store every `ExamSummaryEvent` field. Rows are append-only and validated before merge or import.

Annual event stores never contain aggregate rows. Aggregate rebuild reads validated event shards and atomically replaces the relevant rows in `question_aggregates`.

## Repository boundary

Application and UI code depend on repository interfaces, not TinyBase tables or SiYuan AV bindings:

```ts
interface QuestionCatalogRepository { /* discover, index, list, hydrate locators */ }
interface TopicAnchorRepository { /* discover and resolve anchors */ }
interface AttemptEventRepository { /* append, list, export, import */ }
interface ExamEventRepository { /* append and list */ }
interface PracticeSessionRepository { /* optimistic snapshot operations */ }
interface ExamSessionRepository { /* optimistic snapshot operations */ }
interface QuestionSetBlueprintRepository { /* list, save, remove */ }
interface AggregateRepository { /* read and rebuild caches */ }
```

Implementation placement:

```text
src/question-bank/storage/                 portable schemas and repository contracts
src/question-bank/adapters/tinybase/       tables, queries, shard routing, persistence
src/question-bank/adapters/siyuan/         SQL discovery, blocks, attributes, files, Riff
src/lets-question-bank/store-worker.ts     post-sync merge worker entry
scripts/migrate-av-to-tinybase.ts          development-only legacy migration
```

Only the legacy migration script and the optional Question/Topic Index projection adapters may import AV readers after cutover. Projection reads are limited to validating each selected target and its managed key IDs; they must never feed application repositories.

## Website reuse

The domain schemas, Markdown/IAL parser, repository contracts, TinyBase table definitions, event model, aggregate rebuilds, question-set logic, and migration-safe export envelopes are host-portable. A future website can use them without importing `siyuan`, Svelte plugin lifecycle types, block IDs as business identities, or AV adapters.

The website supplies different host adapters:

```text
Portable Damophus core and TinyBase repositories
├─ SiYuan host
│  ├─ SQL and block discovery
│  ├─ storage/petal persistence
│  ├─ sync-end coordination
│  └─ Riff scheduling
└─ Website host
   ├─ Markdown source loader
   ├─ IndexedDB, OPFS, or server persistence
   ├─ HTTP or CRDT synchronization
   └─ website navigation and scheduling
```

The website adapter is outside this migration's implementation scope, but the migration must not place SiYuan IDs or file paths in repository primary keys. Stable question, topic, attempt, exam, and blueprint IDs remain the interchange contract. Website import/export can consume the same validated domain events even when its physical persistence differs from SiYuan's device-sharded files.

## Runtime flows

### Plugin startup

1. Register models, commands, event handlers, and the `sync-end`/`sync-fail` listeners.
2. Do not enumerate device directories, parse event shards, or merge stores.
3. Keep TinyBase initialization lazy until a question-bank feature needs local state or a successful sync schedules a merge.

### Successful SiYuan synchronization

1. Receive `sync-end`.
2. Debounce repeated events and acquire a per-plugin merge lock.
3. Start a Web Worker.
4. Enumerate device files and compare envelope hashes with the last validated merge record.
5. Load only changed shards plus the required local base state.
6. Validate envelopes and domain rows.
7. Call TinyBase `MergeableStore.merge()`; do not implement field clocks or conflict ordering.
8. Rebuild affected aggregate caches.
9. Publish a validated result to the main thread atomically.
10. Keep the merged state as a read view. Persist only local contribution changes; never rewrite every device file or copy remote contributions into the local file.

On `sync-fail`, retain the last validated state and do nothing. A corrupt shard produces a visible diagnostic but does not block new local immutable events.

### Optional Resource AV Projections

The two projections are configured independently when the user wants SiYuan tables for personal selection and filtering. Neither is initialized by default and neither affects question-bank correctness or availability.

1. User independently selects a Question Index target block and/or a Topic Index target block.
2. Damophus resolves the selected NodeAttributeView block to its AV ID, records stable managed key IDs, and initializes missing managed columns after confirmation.
3. Each profile lets the user select which supported fields are projected.
4. Damophus previews projected row count, additions, updates, stale managed rows, and missing managed columns.
5. **Overwrite managed projection** rewrites only the selected managed fields and removes or replaces only Damophus-managed stale rows; unknown user columns remain untouched.
6. Question and topic profiles can refresh independently, manually or after a successful catalog refresh, but never after each attempt and never during `sync-start`/`sync-end` processing.
7. Missing target, missing columns, or write failure marks only that profile stale and leaves all TinyBase repositories usable.

Projection rows use real SiYuan block bindings automatically. A Question Index row binds to the question catalog entry's current source block. A Topic Index row binds to the canonical note-topic anchor chosen by the same deterministic priority rule used by topic navigation; alternate anchors remain available as projected locations. If a bound source block is deleted, SiYuan may remove the disposable row, and the next refresh either binds the replacement source block or omits the unavailable entry. Users never manually bind projection rows.

Question Index Projection supports browse fields such as stable question ID, title, document location, type, year, subject, category, collection, source, topic IDs, availability, and question aggregate summaries. Topic Index Projection supports topic ID, display title candidates, anchor count and locations, question count, availability, and topic aggregate summaries. Neither profile includes Attempt Log rows, attempt events, exam payloads, AV relations, or rollups as facts. There is no reverse import from projection cells.

The adapters own only explicitly configured projection columns and preserve unknown user columns. Those unknown cells are not Damophus facts and are not guaranteed to survive deletion of the projection database. Any selection or annotation that must drive question-bank behavior belongs in TinyBase, not in an ad hoc AV column.

Projection display strings are intentionally localized. Database names, column names, and select/multi-select option labels may use Chinese because the adapter identifies managed structure by stored AV/key IDs and semantic field keys, never by display text. Renaming a table, column, or option does not change TinyBase data or repository behavior.

### Current-document practice

Current-document scanning remains an explicit user action with the existing preview/confirm content-safety boundary. Confirmation updates permitted IAL and the TinyBase catalog; it does not write any AV.

### Cross-document catalog

Cross-document behavior is built directly on TinyBase:

1. When the user opens catalog, composer, or cross-document exam features, run a SQL candidate query for blocks with `custom-qb-id`.
2. Group candidate blocks by document root.
3. Compare root update metadata and catalog signatures.
4. Parse only new or changed documents with the existing scanner.
5. Upsert valid questions and topic references.
6. Mark disappeared questions `available = false`; never delete their event history.
7. Query TinyBase indexes for filters, quotas, history predicates, and source selection.

SQL discovers candidates; scanner validation determines catalog membership. The plugin does not run a permanent background workspace monitor.

## Development migration

There is no user-facing migration screen. `scripts/migrate-av-to-tinybase.ts` is a development tool run against the current workspace.

### Phase 1: read-only inventory

- Read and export the current binding, Question Index, Topic Index, and Attempt Log.
- Export current plugin practice snapshots, exam snapshot, and question-set settings.
- Record row counts, managed key identities, source block IDs, stable IDs, and malformed rows.
- Hash the raw export and keep it as migration evidence.

### Phase 2: rebuild portable catalogs

- Use SQL and source scans to rebuild questions from Markdown and IAL.
- Derive question-topic references from `custom-qb-question-topic-ids`, not AV relations.
- Discover `custom-qb-note-topic-id` anchors through SQL.
- Treat old Topic Index resource fields as intentionally ignored because they are empty.
- Compare rebuilt question IDs and locations with Question Index and report discrepancies.

### Phase 3: import business facts

- Import valid attempt rows by `attempt_id` into the correct annual device shard.
- Import exam summary rows by stable event ID.
- Import practice and exam snapshots as whole validated snapshots.
- Import question-set blueprints from settings.
- Upsert idempotently; duplicate IDs with identical payloads are no-ops and differing payloads are blockers.

Legacy events without a reliable origin device are assigned to a deterministic migration device namespace so reruns route them to the same files.

### Phase 4: rebuild and reconcile

- Recompute all aggregates from imported attempts.
- Compare recomputed values with old AV rollups.
- Record every mismatch; recomputed event-derived values win.
- Verify per-session event counts, exam status counts, event IDs, question IDs, and annual shard totals.
- Repeat the migration safely until every blocker is resolved.

### Phase 5: one-way cutover

- Write `migration_version = 1` only after reconciliation passes.
- Switch all runtime repositories to TinyBase.
- Disable legacy AV initialization, binding verification, maintenance, relation repair, legacy projection updates, and startup snapshot refresh.
- Leave both AV projection profiles disabled unless the user explicitly configures either one after cutover.
- Do not dual-write or fall back to AV.
- After the first new TinyBase event, rollback is unsupported.
- Produce a final report stating that the user may manually delete the old system document and databases.

## Removing AV runtime dependencies

The following responsibilities must disappear from normal plugin execution:

- Question-bank binding initialization and rebinding.
- AV managed-column creation and key migration.
- Question row add/rebind/update operations.
- Topic relation synchronization and recovery snapshots.
- Detached Attempt Log row reads and writes.
- AV rollup and relation repair.
- Startup AV maintenance checks and AV websocket listeners.

Generic SiYuan attribute-view utilities may remain only if another retained plugin module uses them. Question-bank imports are prohibited outside the legacy migration and Question/Topic Index Projection boundaries. Projection code must be unable to provide data to business repositories.

Static verification should fail when production business modules contain AV endpoints such as:

```text
/api/av/getAttributeView
/api/av/addAttributeViewBlocks
/api/av/setAttributeViewBlockAttr
/api/av/removeAttributeViewBlocks
```

The only allowed runtime AV calls are inside the explicit projection adapter and its tests. `/api/query/sql` remains allowed for host discovery and navigation.

## Performance budget

Measured on the development machine with TinyBase 9.3.0 and representative attempt rows:

| Rows | Mergeable JSON | Parse and load | Two-device full merge |
| ---: | ---: | ---: | ---: |
| 1,000 | 0.21 MB | 25 ms | 50 ms for 2,000 total |
| 10,000 | 2.08 MB | 146 ms | 456 ms for 20,000 total |
| 50,000 | 10.5 MB | 706 ms | 2.23 s for 100,000 total |
| 100,000 | 21.02 MB | 1.68 s | not part of the normal annual target |

Budgets and rules:

- Plugin startup adds no cross-device file enumeration or merge work.
- Current UI keeps the last validated state while post-sync Worker work runs.
- No full merge runs after each attempt.
- Current-year event writes touch only the local device's current annual shard.
- Cross-document SQL discovery and changed-document parsing are asynchronous and cancellable.
- Main-thread tasks attributable to store publication should remain below 50 ms; heavy parsing, merging, validation, and aggregate rebuilds run in a Worker.
- Mobile validation uses at least a 4x slowdown assumption relative to the desktop benchmark.
- Annual shards warn at 25 MB and require a planned monthly-routing migration at 50 MB.

## Failure handling

- Failed file validation: quarantine or diagnostic export; keep last validated state.
- Failed post-sync merge: log and surface the error; do not rewrite any shard.
- Duplicate immutable ID with different payload: stop import/merge for that record and report both origins.
- Session revision conflict: preserve both validated snapshots and require explicit selection.
- Missing question source: mark unavailable; preserve events and aggregates.
- Aggregate cache corruption: discard and rebuild from events.
- SQL discovery failure: retain the previous catalog and allow current-document scanning.

## Verification

### Unit tests

- Zod schemas for every file envelope and stored row materializer.
- Annual shard routing and future monthly-routing compatibility.
- Idempotent append and conflicting duplicate detection.
- Question/topic/anchor catalog queries.
- Aggregate rebuild parity with existing core statistics.
- Whole-snapshot session conflict behavior.
- Corrupt file quarantine and last-good-state preservation.

### Merge tests

- Independent device attempts merge without loss or duplication.
- Concurrent catalog scans converge by stable identity.
- Same immutable ID with different payload is rejected.
- Whole session snapshots are not field-spliced.
- Repeated `sync-end` events coalesce into one Worker job.
- `sync-fail` never triggers a merge.

### Migration tests

- Representative schema versions import deterministically.
- Attempt and exam counts match raw legacy rows.
- Rerunning produces byte-equivalent business state.
- IAL topic relationships override legacy AV relations and discrepancies are reported.
- Recomputed statistics are compared with, but never replaced by, AV rollups.
- Empty Topic Index resources create no TinyBase resource records.

### Browser and package verification

- Question-bank UI becomes interactive without waiting for cross-device merge.
- A post-sync merge updates catalog and statistics without resetting active practice.
- Current-document scan remains preview/confirm and never writes AV.
- Optional Question/Topic Index Projection refreshes only after explicit opt-in and never changes TinyBase facts.
- Cross-document composer reads TinyBase catalog and hydrates current Markdown sources.
- Vitest Browser Mode, TypeScript/Svelte checks, core tests, build, smoke, and package validation pass.

### Cutover acceptance

- No production question-bank business path reads or writes AV data; only the optional Question/Topic Index Projection adapters may write disposable views.
- All attempts, exams, sessions, blueprints, catalogs, anchors, and statistics use repositories backed by TinyBase.
- SQL is limited to SiYuan host discovery and navigation.
- Migration reconciliation has no unresolved blockers.
- New events remain available after source-block deletion and plugin reload.
- Removing the old AV system document does not disable any question-bank workflow.

## Implementation sequence and commit boundaries

1. Add TinyBase and portable storage contracts, schemas, and tests.
2. Implement file envelopes, device identity, shard routing, and TinyBase repositories.
3. Implement `sync-end` coordination, Worker merge, locking, validation, and failure handling.
4. Move sessions, exams, question sets, attempts, and aggregates behind repositories.
5. Replace Question Index reads with TinyBase catalog and implement SQL-driven cross-document discovery.
6. Implement and test the idempotent development migration script.
7. Run migration against the current workspace and save the reconciliation report.
8. Cut over runtime wiring, remove legacy AV maintenance, relations, and listeners, and add isolated Question/Topic Index Projection adapters.
9. Run full Node, Browser Mode, Svelte, build, smoke, package, and live-workspace validation.
10. Update old architecture, contract, migration, and user-guide documents to mark AV sections superseded.

Each step is committed by functional boundary. Unrelated dirty work remains unstaged.
